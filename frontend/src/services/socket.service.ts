// frontend/src/services/socket.service.ts

import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;
  private messageHandlers: Set<(message: any) => void> = new Set();
  private groupMessageHandlers: Set<(message: any) => void> = new Set();
  private groupJoinedHandlers: Set<(data: any) => void> = new Set();
  private groupLeftHandlers: Set<(data: any) => void> = new Set();

  connect(userId: string): Socket {
    if (this.socket?.connected) {
      console.log(" [SOCKET] Já conectado, reutilizando conexão");
      return this.socket;
    }

    console.log(" [SOCKET] Conectando ao servidor WebSocket...");
    console.log("  User ID:", userId);

    this.socket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Evento: conectado
    this.socket.on("connect", () => {
      console.log("[SOCKET] Conectado ao servidor");
      console.log("  Socket ID:", this.socket?.id);

      // Registrar usuário
      this.socket?.emit("register", userId);
      console.log("[SOCKET] Usuário registrado:", userId);
    });

    // Evento: erro de conexão
    this.socket.on("connect_error", (error) => {
      console.error("[SOCKET] Erro de conexão:", error.message);
    });

    // Evento: desconectado
    this.socket.on("disconnect", (reason) => {
      console.log(" [SOCKET] Desconectado:", reason);

      if (reason === "io server disconnect") {
        // Servidor desconectou, reconectar manualmente
        this.socket?.connect();
      }
    });

    // Evento: mensagem recebida
    this.socket.on("message:receive", (message) => {
      console.log("[SOCKET] Nova mensagem recebida via WebSocket");
      console.log("  De:", message.senderId);
      console.log(
        "  Dados cifrados (primeiros 50):",
        message.encryptedData?.substring(0, 50)
      );

      // Notificar todos os handlers registrados
      this.messageHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error("[SOCKET] Erro ao processar mensagem:", error);
        }
      });
    });

    // Evento: mensagem de grupo recebida
    this.socket.on("group:message:receive", (message) => {
      console.log("[SOCKET] Nova mensagem de grupo recebida via WebSocket");
      console.log("  Grupo:", message.groupId);
      console.log("  De:", message.senderName);

      // Notificar todos os handlers de grupo
      this.groupMessageHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error("[SOCKET] Erro ao processar mensagem de grupo:", error);
        }
      });
    });

    // Evento: adicionado a um grupo
    this.socket.on("group:joined", (data) => {
      console.log("[SOCKET] Adicionado a um grupo:", data.groupId);

      this.groupJoinedHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error("[SOCKET] Erro ao processar group:joined:", error);
        }
      });
    });

    // Evento: removido de um grupo
    this.socket.on("group:left", (data) => {
      console.log("[SOCKET] Removido de um grupo:", data.groupId);

      this.groupLeftHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error("[SOCKET] Erro ao processar group:left:", error);
        }
      });
    });

    return this.socket;
  }

  // Adicionar handler para mensagens recebidas
  onMessage(handler: (message: any) => void): () => void {
    console.log("[SOCKET] Registrando listener de mensagens");
    this.messageHandlers.add(handler);

    // Retornar função para remover o handler
    return () => {
      console.log("[SOCKET] Removendo listener de mensagens");
      this.messageHandlers.delete(handler);
    };
  }

  // Adicionar handler para mensagens de grupo
  onGroupMessage(handler: (message: any) => void): () => void {
    console.log("[SOCKET] Registrando listener de mensagens de grupo");
    this.groupMessageHandlers.add(handler);

    return () => {
      console.log("[SOCKET] Removendo listener de mensagens de grupo");
      this.groupMessageHandlers.delete(handler);
    };
  }

  // Adicionar handler para quando for adicionado a um grupo
  onGroupJoined(handler: (data: any) => void): () => void {
    console.log("[SOCKET] Registrando listener de group:joined");
    this.groupJoinedHandlers.add(handler);

    return () => {
      console.log("[SOCKET] Removendo listener de group:joined");
      this.groupJoinedHandlers.delete(handler);
    };
  }

  // Adicionar handler para quando for removido de um grupo
  onGroupLeft(handler: (data: any) => void): () => void {
    console.log("[SOCKET] Registrando listener de group:left");
    this.groupLeftHandlers.add(handler);

    return () => {
      console.log("[SOCKET] Removendo listener de group:left");
      this.groupLeftHandlers.delete(handler);
    };
  }

  disconnect() {
    if (this.socket) {
      console.log(" [SOCKET] Desconectando...");
      this.messageHandlers.clear();
      this.groupMessageHandlers.clear();
      this.groupJoinedHandlers.clear();
      this.groupLeftHandlers.clear();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new SocketService();
