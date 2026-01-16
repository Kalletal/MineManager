package com.minemanager;

import org.bukkit.command.*;
import org.bukkit.entity.Player;

public class PortalCommand implements CommandExecutor {
    private final MineManagerPlugin plugin;

    public PortalCommand(MineManagerPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only!");
            return true;
        }
        if (args.length < 1) {
            sender.sendMessage("§eUsage: /portal <create|delete|list>");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "create" -> {
                if (args.length < 3) {
                    sender.sendMessage("§eUsage: /portal create <name> <targetServerId>");
                    return true;
                }
                String name = args[1];
                String target = args[2];
                var loc = player.getLocation();
                plugin.getPortals().put(name, new Portal(
                    java.util.UUID.randomUUID().toString(),
                    name,
                    target,
                    target,
                    loc.getWorld().getName(),
                    loc.getBlockX(),
                    loc.getBlockY(),
                    loc.getBlockZ(),
                    loc.getBlockX() + 5,
                    loc.getBlockZ() + 5,
                    "flat"
                ));
                sender.sendMessage("§aPortal '" + name + "' created!");
            }
            case "delete" -> {
                if (args.length < 2) {
                    sender.sendMessage("§eUsage: /portal delete <name>");
                    return true;
                }
                if (plugin.getPortals().remove(args[1]) != null) {
                    sender.sendMessage("§aPortal deleted!");
                } else {
                    sender.sendMessage("§cPortal not found!");
                }
            }
            case "list" -> {
                sender.sendMessage("§6Portals:");
                plugin.getPortals().forEach((n, p) -> sender.sendMessage("§7- " + n + " → " + p.targetServerId));
            }
            default -> sender.sendMessage("§eUsage: /portal <create|delete|list>");
        }
        return true;
    }
}
