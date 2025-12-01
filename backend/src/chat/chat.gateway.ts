/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SendGroupMessageDto } from './dto/send-group-message.dto';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173', // Vite default port
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string>(); // userId -> socketId

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log('🔌 [WEBSOCKET] Cliente conectado:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('🔌 [WEBSOCKET] Cliente desconectado:', client.id);

    // Remover do mapa de usuários conectados
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        console.log(`👤 [WEBSOCKET] Usuário ${userId} desconectado`);
        break;
      }
    }
  }

  @SubscribeMessage('user:online')
  handleUserOnline(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log(
      '[WEBSOCKET] Usuário online:',
      data.userId,
      'Socket:',
      client.id,
    );
    this.userSockets.set(data.userId, client.id);
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      senderId: string;
      receiverId: string;
      encryptedData: string;
      nonce: string;
      senderEphemPk: string;
      senderEncryptedData: string; // Adicionado
      senderNonce: string; // Adicionado
      senderEphemPkForSelf: string; // Adicionado
    },
  ) {
    try {
      console.log('[WEBSOCKET] Nova mensagem recebida');
      console.log('  De:', data.senderId);
      console.log('  Para:', data.receiverId);
      console.log(
        '  Dados cifrados (primeiros 50 chars):',
        data.encryptedData.substring(0, 50) + '...',
      );
      console.log('  Nonce:', data.nonce);
      console.log(
        '  Chave efêmera pública:',
        data.senderEphemPk.substring(0, 30) + '...',
      );

      // Salvar no banco
      const message = await this.chatService.saveMessage(data);

      console.log('[WEBSOCKET] Mensagem salva no banco:', message.id);

      // Enviar para o destinatário se estiver online
      const receiverSocketId = this.userSockets.get(data.receiverId);

      if (receiverSocketId) {
        console.log('[WEBSOCKET] Destinatário está online, enviando...');
        console.log('  Socket ID do destinatário:', receiverSocketId);

        this.server.to(receiverSocketId).emit('message:receive', {
          id: message.id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          encryptedData: message.encryptedData,
          nonce: message.nonce,
          senderEphemPk: message.senderEphemPk,
          createdAt: message.createdAt,
        });

        console.log('[WEBSOCKET] Mensagem enviada para destinatário');
      } else {
        console.log(
          '⏸️ [WEBSOCKET] Destinatário offline, mensagem salva no banco',
        );
      }
      // Confirmar para o remetente
      client.emit('message:sent', { success: true, messageId: message.id });

      return message;
    } catch (error) {
      console.error('[WEBSOCKET] Erro ao processar mensagem:', error);
      client.emit('message:error', { message: error.message });
    }
  }

  // Garantir que o registro de usuário está funcionando
  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    console.log('📝 [WEBSOCKET] Registrando usuário');
    console.log('  User ID:', userId);
    console.log('  Socket ID:', client.id);

    this.userSockets.set(userId, client.id);

    console.log('[WEBSOCKET] Usuário registrado');
    console.log('  Total de usuários online:', this.userSockets.size);
  }

  @SubscribeMessage('group:message:send')
  async handleGroupMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendGroupMessageDto,
  ) {
    console.log('👥 [WEBSOCKET] Nova mensagem de grupo');
    console.log('  Grupo:', data.groupId);
    console.log('  De:', data.senderId);

    try {
      // Salvar no banco
      const message = await this.chatService.saveGroupMessage(data);

      // Buscar membros do grupo
      const members = await this.chatService.getGroupMembers(data.groupId);

      console.log(`[WEBSOCKET] Enviando para ${members.length} membros`);

      // Enviar para todos os membros online
      members.forEach((member) => {
        const socketId = this.userSockets.get(member.userId);
        if (socketId && member.userId !== data.senderId) {
          this.server.to(socketId).emit('group:message:receive', {
            id: message.id,
            groupId: data.groupId,
            senderId: message.senderId,
            senderName: message.sender.name,
            encryptedData: message.encryptedData,
            nonce: message.nonce,
            keyVersion: message.keyVersion,
            createdAt: message.createdAt,
          });
        }
      });

      // Confirmar para o remetente
      client.emit('group:message:sent', {
        success: true,
        messageId: message.id,
      });

      console.log('[WEBSOCKET] Mensagem de grupo processada');
    } catch (error) {
      console.error('[WEBSOCKET] Erro ao processar mensagem de grupo:', error);
      client.emit('group:message:error', { message: error.message });
    }
  }

  @SubscribeMessage('group:member:added')
  handleMemberAdded(
    @MessageBody() data: { groupId: string; userId: string; userName: string },
  ) {
    console.log('➕ [WEBSOCKET] Notificando novo membro adicionado');

    // Notificar o novo membro
    const socketId = this.userSockets.get(data.userId);
    if (socketId) {
      this.server.to(socketId).emit('group:joined', {
        groupId: data.groupId,
      });
    }
  }

  @SubscribeMessage('group:member:removed')
  handleMemberRemoved(
    @MessageBody() data: { groupId: string; userId: string },
  ) {
    console.log(' [WEBSOCKET] Notificando membro removido');

    // Notificar o membro removido
    const socketId = this.userSockets.get(data.userId);
    if (socketId) {
      this.server.to(socketId).emit('group:left', {
        groupId: data.groupId,
      });
    }
  }
}
