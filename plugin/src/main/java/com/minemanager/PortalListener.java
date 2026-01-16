package com.minemanager;

import org.bukkit.event.*;
import org.bukkit.event.player.PlayerMoveEvent;
import java.util.*;

public class PortalListener implements Listener {
    private final MineManagerPlugin plugin;
    private final Set<UUID> cooldown = new HashSet<>();

    public PortalListener(MineManagerPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onMove(PlayerMoveEvent e) {
        if (cooldown.contains(e.getPlayer().getUniqueId())) return;
        
        for (Portal portal : plugin.getPortals().values()) {
            if (portal.isInside(e.getTo())) {
                cooldown.add(e.getPlayer().getUniqueId());
                plugin.requestTransfer(e.getPlayer(), portal);
                plugin.getServer().getScheduler().runTaskLater(plugin, 
                    () -> cooldown.remove(e.getPlayer().getUniqueId()), 200); // 10 seconds
                break;
            }
        }
    }
}
