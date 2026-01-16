# MineManager

Gestionnaire de serveurs Minecraft avec interface web et portails inter-serveurs.

## Features

- 🎮 Support **Paper**, **Spigot**, et **Mohist**
- 🚀 Création dynamique de serveurs
- 📊 Monitoring temps réel (TPS, RAM, joueurs)
- 🌀 Portails inter-serveurs pour téléporter les joueurs
- 📝 Logs en temps réel
- 🎛️ Dashboard web moderne

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Dashboard     │◄───►│  Backend Node.js │◄───►│  MC Servers     │
│   (React)       │ WS  │  (Express+WS)    │ WS  │  + Plugin       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Installation

### Prérequis
- Node.js 18+
- Java 17+ (pour les serveurs Minecraft)
- Maven (pour compiler le plugin)

### Backend

```bash
cd backend
npm install
npm run dev
```

Le backend démarre sur `http://localhost:3000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Le dashboard est accessible sur `http://localhost:5173`

### Plugin Minecraft

```bash
cd plugin
mvn package
```

Le JAR sera dans `target/MineManagerPlugin-1.0.0.jar`. Copiez-le dans le dossier `plugins/` de vos serveurs.

## Utilisation

### Créer un serveur

1. Ouvrez le dashboard
2. Cliquez sur "+ New Server"
3. Configurez : nom, type (Paper/Spigot/Mohist), version, port, RAM
4. Cliquez sur "Create"

### Gérer les serveurs

- **Start/Stop** : Boutons dans le dashboard
- **Logs** : Affichés en temps réel
- **Métriques** : TPS, RAM, joueurs connectés

### Créer des portails

Dans le jeu, utilisez les commandes :

```
/portal create <nom> <serverId> [radius]
/portal delete <nom>
/portal list
```

Quand un joueur entre dans la zone du portail, il est transféré vers le serveur cible.

## Configuration du plugin

`plugins/MineManagerPlugin/config.yml`:

```yaml
manager-url: "ws://localhost:3000/servers"
server-id: "auto"  # ou un ID spécifique
```

## API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/servers | Liste des serveurs |
| POST | /api/servers | Créer un serveur |
| POST | /api/servers/:id/start | Démarrer |
| POST | /api/servers/:id/stop | Arrêter |
| DELETE | /api/servers/:id | Supprimer |
| GET | /api/servers/:id/logs | Logs |
| GET | /api/portals | Liste des portails |
| POST | /api/portals | Créer un portail |

## WebSocket Events

### Namespace `/dashboard`
- `servers` : Liste mise à jour des serveurs
- `log` : Nouvelle ligne de log
- `metrics` : Métriques d'un serveur

### Namespace `/servers`
- `register` : Enregistrement d'un serveur MC
- `metrics` : Envoi des métriques
- `transferRequest` : Demande de transfert joueur

## License

MIT
