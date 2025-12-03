/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendGroupMessageDto } from './dto/send-group-message.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { RotateGroupKeyDto } from './dto/rotate-group-key.dto';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
  ) {}

  async saveMessage(data: SendMessageDto) {
    const message = await this.prisma.message.create({
      data: {
        senderId: data.senderId,
        receiverId: data.receiverId,
        encryptedData: data.encryptedData,
        nonce: data.nonce,
        senderEphemPk: data.senderEphemPk,
        // Adicionar campos para o remetente
        senderEncryptedData: data.senderEncryptedData,
        senderNonce: data.senderNonce,
        senderEphemPkForSelf: data.senderEphemPkForSelf,
      },
    });
    console.log('[CHAT] Mensagem salva:', message.id);
    return message;
  }

  async getConversation(userId1: string, userId2: string) {
    console.log(` [CHAT] Buscando histórico: ${userId1} ↔ ${userId2}`);

    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    console.log(` [CHAT] Encontradas ${messages.length} mensagens`);
    return messages;
  }

  async getUserChats(userId: string) {
    console.log(`[CHAT] Buscando conversas do usuário: ${userId}`);

    // Buscar últimas mensagens de cada conversa
    const sentMessages = await this.prisma.message.findMany({
      where: { senderId: userId },
      distinct: ['receiverId'],
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const receivedMessages = await this.prisma.message.findMany({
      where: { receiverId: userId },
      distinct: ['senderId'],
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Combinar e remover duplicatas
    const chats = new Map();

    sentMessages.forEach((msg) => {
      if (!chats.has(msg.receiverId)) {
        chats.set(msg.receiverId, {
          userId: msg.receiverId,
          name: msg.receiver.name,
          email: msg.receiver.email,
          lastMessage: msg.createdAt,
        });
      }
    });

    receivedMessages.forEach((msg) => {
      if (!chats.has(msg.senderId)) {
        chats.set(msg.senderId, {
          userId: msg.senderId,
          name: msg.sender.name,
          email: msg.sender.email,
          lastMessage: msg.createdAt,
        });
      }
    });

    const chatList = Array.from(chats.values()).sort(
      (a, b) => b.lastMessage.getTime() - a.lastMessage.getTime(),
    );

    console.log(`[CHAT] Encontradas ${chatList.length} conversas`);

    return chatList;
  }

  // ========== GRUPOS ==========

  async createGroup(data: CreateGroupDto) {
    console.log('[CHAT-GROUP] Criando grupo:', data.name);

    // Criar grupo
    const group = await this.prisma.group.create({
      data: {
        name: data.name,
        description: data.description,
        creatorId: data.creatorId,
      },
    });

    console.log('[CHAT-GROUP] Grupo criado:', group.id);

    // Adicionar membros (incluindo criador como admin)
    const memberPromises = data.members.map(async (member) => {
      const role = member.userId === data.creatorId ? 'admin' : 'member';

      return this.prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId: member.userId,
          encryptedGroupKey: member.encryptedGroupKey,
          ephemeralPublicKey: member.ephemeralPublicKey,
          keyVersion: 1,
          role,
        },
      });
    });

    await Promise.all(memberPromises);

    console.log(`[CHAT-GROUP] ${data.members.length} membros adicionados`);

    // Notificar todos os membros (exceto o criador) via WebSocket
    data.members.forEach((member) => {
      if (member.userId !== data.creatorId) {
        this.chatGateway.notifyGroupJoined(member.userId, group.id);
      }
    });

    return this.getGroupById(group.id);
  }

  async getGroupById(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    return group;
  }

  async getUserGroups(userId: string) {
    console.log('[CHAT-GROUP] Buscando grupos do usuário:', userId);

    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            creator: {
              select: { id: true, name: true },
            },
            _count: {
              select: { members: true, messages: true },
            },
          },
        },
      },
      orderBy: {
        group: { updatedAt: 'desc' },
      },
    });

    console.log(`[CHAT-GROUP] ${memberships.length} grupos encontrados`);

    return memberships.map((m) => ({
      ...m.group,
      myRole: m.role,
      myEncryptedGroupKey: m.encryptedGroupKey,
      myEphemeralPublicKey: m.ephemeralPublicKey,
      myKeyVersion: m.keyVersion,
    }));
  }

  async addGroupMember(data: AddMemberDto) {
    console.log('[CHAT-GROUP] Adicionando membro ao grupo');

    // Verificar se quem está adicionando é admin
    const adderMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: data.groupId,
          userId: data.addedBy,
        },
      },
    });

    if (!adderMember || adderMember.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem adicionar membros',
      );
    }

    // Verificar se usuário já é membro
    const existing = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: data.groupId,
          userId: data.userId,
        },
      },
    });

    if (existing) {
      throw new ForbiddenException('Usuário já é membro do grupo');
    }

    // Adicionar membro
    const member = await this.prisma.groupMember.create({
      data: {
        groupId: data.groupId,
        userId: data.userId,
        encryptedGroupKey: data.encryptedGroupKey,
        ephemeralPublicKey: data.ephemeralPublicKey,
        keyVersion: adderMember.keyVersion, // Mesma versão do admin
        role: 'member',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    console.log('[CHAT-GROUP] Membro adicionado:', member.user.name);

    // Notificar o novo membro via WebSocket
    this.chatGateway.notifyGroupJoined(data.userId, data.groupId);

    return member;
  }

  async removeGroupMember(groupId: string, userId: string, removedBy: string) {
    console.log(' [CHAT-GROUP] Removendo membro do grupo');

    // Verificar se quem está removendo é admin ou o próprio usuário saindo
    const removerMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: removedBy,
        },
      },
    });

    const isSelfLeaving = userId === removedBy;
    const isAdmin = removerMember?.role === 'admin';

    if (!isSelfLeaving && !isAdmin) {
      throw new ForbiddenException(
        'Apenas administradores podem remover membros',
      );
    }

    // Não permitir que o criador saia se for o único admin
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: true,
      },
    });

    if (group?.creatorId === userId) {
      const adminCount = group.members.filter((m) => m.role === 'admin').length;
      if (adminCount === 1 && group.members.length > 1) {
        throw new ForbiddenException(
          'Transfira a administração antes de sair do grupo',
        );
      }
    }

    // Remover membro
    await this.prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    console.log('[CHAT-GROUP] Membro removido');

    // Notificar o membro removido via WebSocket
    this.chatGateway.notifyGroupLeft(userId, groupId);

    // Se não sobrou ninguém, deletar grupo
    const remainingMembersCount = await this.prisma.groupMember.count({
      where: { groupId },
    });

    if (remainingMembersCount === 0) {
      await this.prisma.group.delete({ where: { id: groupId } });
      console.log('[CHAT-GROUP] Grupo vazio deletado');
      return { deleted: true, shouldRotateKey: false, remainingMembers: [] };
    }

    // Buscar membros restantes com suas chaves públicas para Geração de chave
    const remainingMembers = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            publicKeys: true,
          },
        },
      },
    });

    const currentMaxVersion = Math.max(
      ...remainingMembers.map((m) => m.keyVersion),
    );

    console.log(
      '[CHAT-GROUP] Geração de chave necessária para',
      remainingMembers.length,
      'membros',
    );

    return {
      deleted: false,
      shouldRotateKey: true,
      currentKeyVersion: currentMaxVersion,
      remainingMembers: remainingMembers.map((m) => ({
        userId: m.userId,
        userName: m.user.name,
        publicKey: m.user.publicKeys[0]?.publicKey,
      })),
    };
  }

  async deleteGroup(groupId: string, userId: string) {
    console.log('[CHAT-GROUP] Deletando grupo:', groupId);

    // Verificar se é o criador
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    if (group.creatorId !== userId) {
      throw new ForbiddenException('Apenas o criador pode deletar o grupo');
    }

    // Deletar grupo (cascade deleta membros e mensagens)
    await this.prisma.group.delete({
      where: { id: groupId },
    });

    console.log('[CHAT-GROUP] Grupo deletado');

    return { success: true };
  }

  async saveGroupMessage(data: SendGroupMessageDto) {
    console.log('[CHAT-GROUP] Salvando mensagem de grupo...');

    // Verificar se usuário é membro
    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: data.groupId,
          userId: data.senderId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Você não é membro deste grupo');
    }

    const message = await this.prisma.groupMessage.create({
      data: {
        groupId: data.groupId,
        senderId: data.senderId,
        encryptedData: data.encryptedData,
        nonce: data.nonce,
        keyVersion: data.keyVersion,
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    // Atualizar updatedAt do grupo
    await this.prisma.group.update({
      where: { id: data.groupId },
      data: { updatedAt: new Date() },
    });

    console.log('[CHAT-GROUP] Mensagem de grupo salva:', message.id);

    return message;
  }

  async getGroupMessages(groupId: string, userId: string) {
    console.log(' [CHAT-GROUP] Buscando mensagens do grupo:', groupId);

    // Verificar se usuário é membro
    const member = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: groupId,
          userId: userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Você não é membro deste grupo');
    }

    const messages = await this.prisma.groupMessage.findMany({
      where: { groupId },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[CHAT-GROUP] ${messages.length} mensagens encontradas`);

    return messages;
  }

  async getGroupMembers(groupId: string) {
    return this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            publicKeys: true,
          },
        },
      },
    });
  }

  /**
   * Rotaciona a chave do grupo (incrementa keyVersion e atualiza chaves de todos os membros)
   * Deve ser chamado quando um membro é removido para garantir segurança forward
   */
  async rotateGroupKey(data: RotateGroupKeyDto) {
    console.log('\n BACKEND: Geração de chave');
    console.log('   Grupo:', data.groupId);
    console.log('   Nova versão:', data.newKeyVersion);
    console.log('   Membros:', data.memberKeys.length);

    // Verificar se quem está rotacionando é admin
    const rotatorMember = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: data.groupId,
          userId: data.rotatedBy,
        },
      },
    });

    if (!rotatorMember || rotatorMember.role !== 'admin') {
      throw new ForbiddenException(
        'Apenas administradores podem rotacionar a chave do grupo',
      );
    }

    // Verificar se o grupo existe
    const group = await this.prisma.group.findUnique({
      where: { id: data.groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException('Grupo não encontrado');
    }

    // Verificar se a nova versão é maior que a atual
    const currentMaxVersion = Math.max(...group.members.map((m) => m.keyVersion));

    console.log('   Versão anterior:', currentMaxVersion);

    if (data.newKeyVersion <= currentMaxVersion) {
      throw new ForbiddenException(
        `Nova versão de chave (${data.newKeyVersion}) deve ser maior que a atual (${currentMaxVersion})`,
      );
    }

    // Atualizar a chave de cada membro usando transação
    await this.prisma.$transaction(
      data.memberKeys.map((memberKey) =>
        this.prisma.groupMember.update({
          where: {
            groupId_userId: {
              groupId: data.groupId,
              userId: memberKey.userId,
            },
          },
          data: {
            encryptedGroupKey: memberKey.encryptedGroupKey,
            ephemeralPublicKey: memberKey.ephemeralPublicKey,
            keyVersion: data.newKeyVersion,
          },
        }),
      ),
    );

    // Notificar todos os membros sobre a nova chave via WebSocket
    data.memberKeys.forEach((memberKey) => {
      this.chatGateway.notifyGroupKeyRotated(
        memberKey.userId,
        data.groupId,
        data.newKeyVersion,
      );
    });

    console.log(' Geração concluída!\n');

    return {
      success: true,
      newKeyVersion: data.newKeyVersion,
      membersUpdated: data.memberKeys.length,
    };
  }
}
