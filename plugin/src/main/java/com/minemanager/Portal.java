package com.minemanager;

import org.bukkit.Location;
import org.bukkit.Bukkit;

public class Portal {
    public final String id;
    public final String name;
    public final String targetServerId;
    public final String targetServerName;
    public final String world;
    public final int x;
    public final int y;
    public final int z;
    public final int x2;
    public final int z2;
    public final int radius;
    public final String shape; // "sphere", "flat", or "rectangle"

    public Portal(String id, String name, String targetServerId, String targetServerName, String world, int x, int y, int z, int x2, int z2, String shape) {
        this.id = id;
        this.name = name;
        this.targetServerId = targetServerId;
        this.targetServerName = targetServerName;
        this.world = world;
        this.x = x;
        this.y = y;
        this.z = z;
        this.x2 = x2;
        this.z2 = z2;
        this.radius = 3; // 3 blocks radius for circle shapes
        this.shape = shape != null ? shape : "flat";
    }

    public boolean isInside(Location loc) {
        if (loc == null || !loc.getWorld().getName().equals(world)) return false;
        
        if ("rectangle".equals(shape)) {
            // 2D rectangular area with Y tolerance
            double dy = Math.abs(loc.getY() - y);
            int minX = Math.min(x, x2);
            int maxX = Math.max(x, x2);
            int minZ = Math.min(z, z2);
            int maxZ = Math.max(z, z2);
            return loc.getX() >= minX && loc.getX() <= maxX && 
                   loc.getZ() >= minZ && loc.getZ() <= maxZ && dy <= 2;
        } else if ("sphere".equals(shape)) {
            // 3D spherical area
            double dx = loc.getX() - x;
            double dy = loc.getY() - y;
            double dz = loc.getZ() - z;
            return Math.sqrt(dx*dx + dy*dy + dz*dz) <= radius;
        } else {
            // 2D flat circle with Y tolerance
            double dx = loc.getX() - x;
            double dz = loc.getZ() - z;
            double dy = Math.abs(loc.getY() - y);
            return Math.sqrt(dx*dx + dz*dz) <= radius && dy <= 2;
        }
    }
}
