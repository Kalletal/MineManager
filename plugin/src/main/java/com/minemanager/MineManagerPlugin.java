package com.minemanager;

import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import java.net.URI;
import java.util.*;

public class MineManagerPlugin extends JavaPlugin {
    private WebSocketClient ws;
    private final Gson gson = new Gson();
    private String serverId;
    private final Map<String, Portal> portals = new HashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        serverId = getConfig().getString("server-id", UUID.randomUUID().toString());
        
        // Register BungeeCord messaging channel
        getServer().getMessenger().registerOutgoingPluginChannel(this, "BungeeCord");
        
        loadPortals();
        startMetricsTask();
        
        getCommand("portal").setExecutor(new PortalCommand(this));
        Bukkit.getPluginManager().registerEvents(new PortalListener(this), this);
        
        getLogger().info("MineManagerPlugin enabled!");
        
        // Reload portals every 30 seconds
        new BukkitRunnable() {
            @Override
            public void run() {
                loadPortals();
            }
        }.runTaskTimerAsynchronously(this, 600, 600);
    }

    @Override
    public void onDisable() {
        getLogger().info("MineManagerPlugin disabled!");
    }

    private void connectWebSocket() {
        try {
            String url = getConfig().getString("manager-url", "http://localhost:3000");
            // Convert http to ws for WebSocket
            String wsUrl = url.replace("http://", "ws://").replace("https://", "wss://");
            if (!wsUrl.startsWith("ws")) {
                wsUrl = "ws://" + wsUrl;
            }
            wsUrl = wsUrl + "/dashboard";
            
            ws = new WebSocketClient(new URI(wsUrl)) {
                @Override
                public void onOpen(ServerHandshake h) {
                    JsonObject reg = new JsonObject();
                    reg.addProperty("serverId", serverId);
                    send(gson.toJson(Map.of("event", "register", "data", reg)));
                    getLogger().info("Connected to MineManager");
                }
                @Override
                public void onMessage(String msg) {
                    handleMessage(msg);
                }
                @Override
                public void onClose(int code, String reason, boolean remote) {
                    getLogger().warning("Disconnected from MineManager, reconnecting...");
                    new BukkitRunnable() { public void run() { connectWebSocket(); } }.runTaskLater(MineManagerPlugin.this, 100);
                }
                @Override
                public void onError(Exception e) {
                    getLogger().severe("WebSocket error: " + e.getMessage());
                }
            };
            ws.connect();
        } catch (Exception e) {
            getLogger().severe("Failed to connect: " + e.getMessage());
        }
    }

    private void handleMessage(String msg) {
        JsonObject json = gson.fromJson(msg, JsonObject.class);
        String event = json.get("event").getAsString();
        
        if ("transfer".equals(event)) {
            String playerName = json.getAsJsonObject("data").get("player").getAsString();
            String targetServer = json.getAsJsonObject("data").get("server").getAsString();
            Player player = Bukkit.getPlayer(playerName);
            if (player != null) {
                transferPlayer(player, targetServer);
            }
        } else if ("portals".equals(event)) {
            loadPortalsFromData(json.getAsJsonArray("data"));
        }
    }

    private void loadPortals() {
        new BukkitRunnable() {
            @Override
            public void run() {
                try {
                    String url = getConfig().getString("manager-url", "http://localhost:3000").replace("ws://", "http://");
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(url + "/api/public/portals?serverId=" + serverId).openConnection();
                    conn.setRequestMethod("GET");
                    
                    if (conn.getResponseCode() == 200) {
                        java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream()));
                        String response = reader.lines().collect(java.util.stream.Collectors.joining());
                        reader.close();
                        
                        com.google.gson.JsonArray portalsData = gson.fromJson(response, com.google.gson.JsonArray.class);
                        loadPortalsFromData(portalsData);
                        getLogger().info("Loaded " + portals.size() + " portals");
                    } else {
                        getLogger().warning("Failed to load portals: HTTP " + conn.getResponseCode());
                    }
                } catch (Exception e) {
                    getLogger().warning("Failed to load portals: " + e.getMessage());
                }
            }
        }.runTaskAsynchronously(this);
    }

    private void loadPortalsFromData(com.google.gson.JsonArray data) {
        portals.clear();
        for (int i = 0; i < data.size(); i++) {
            JsonObject p = data.get(i).getAsJsonObject();
            Portal portal = new Portal(
                p.get("id").getAsString(),
                p.get("name").getAsString(),
                p.get("targetServerId").getAsString(),
                p.has("targetServerName") ? p.get("targetServerName").getAsString() : "Unknown",
                p.get("world").getAsString(),
                p.get("x").getAsInt(),
                p.get("y").getAsInt(),
                p.get("z").getAsInt(),
                p.has("x2") ? p.get("x2").getAsInt() : 0,
                p.has("z2") ? p.get("z2").getAsInt() : 0,
                p.has("shape") ? p.get("shape").getAsString() : "flat"
            );
            portals.put(portal.id, portal);
        }
    }

    private void startMetricsTask() {
        // Send player positions every 5 seconds
        new BukkitRunnable() {
            @Override
            public void run() {
                sendPlayerPositions();
            }
        }.runTaskTimerAsynchronously(this, 100, 100); // Every 5 seconds
    }
    
    private void sendPlayerPositions() {
        try {
            String apiUrl = getConfig().getString("api-url", "http://localhost:3000");
            java.net.URL url = new java.net.URL(apiUrl + "/api/servers/" + serverId + "/players");
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            
            JsonObject data = new JsonObject();
            com.google.gson.JsonArray players = new com.google.gson.JsonArray();
            
            for (Player player : Bukkit.getOnlinePlayers()) {
                JsonObject p = new JsonObject();
                p.addProperty("name", player.getName());
                p.addProperty("x", player.getLocation().getBlockX());
                p.addProperty("y", player.getLocation().getBlockY());
                p.addProperty("z", player.getLocation().getBlockZ());
                p.addProperty("world", player.getWorld().getName());
                players.add(p);
            }
            
            data.add("players", players);
            
            try (java.io.OutputStream os = conn.getOutputStream()) {
                os.write(gson.toJson(data).getBytes());
            }
            
            conn.getResponseCode(); // Trigger request
            conn.disconnect();
        } catch (Exception e) {
            // Silent fail - not critical
        }
    }

    private double getTps() {
        try {
            Object server = Bukkit.getServer().getClass().getMethod("getServer").invoke(Bukkit.getServer());
            double[] tps = (double[]) server.getClass().getField("recentTps").get(server);
            return Math.min(20, tps[0]);
        } catch (Exception e) {
            return 20.0;
        }
    }

    public void transferPlayer(Player player, String targetServer) {
        // Use BungeeCord plugin messaging
        player.sendMessage("§aTransferring to " + targetServer + "...");
        var out = new java.io.ByteArrayOutputStream();
        var data = new java.io.DataOutputStream(out);
        try {
            data.writeUTF("Connect");
            data.writeUTF(targetServer);
            player.sendPluginMessage(this, "BungeeCord", out.toByteArray());
        } catch (Exception e) {
            player.sendMessage("§cTransfer failed!");
            getLogger().warning("Transfer failed: " + e.getMessage());
        }
    }

    public void requestTransfer(Player player, Portal portal) {
        // Direct transfer via BungeeCord using server name
        transferPlayer(player, portal.targetServerName);
    }

    public String getServerId() { return serverId; }
    public Map<String, Portal> getPortals() { return portals; }
}
