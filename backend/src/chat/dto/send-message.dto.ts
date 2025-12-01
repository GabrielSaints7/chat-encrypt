// backend/src/chat/dto/send-message.dto.ts

import { Prisma } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto implements Omit<
  Prisma.MessageCreateInput,
  'id' | 'createdAt' | 'sender' | 'receiver'
> {
  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;

  // Para o destinatário
  @IsString()
  @IsNotEmpty()
  encryptedData: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;

  @IsString()
  @IsNotEmpty()
  senderEphemPk: string;

  // Para o remetente
  @IsString()
  @IsNotEmpty()
  senderEncryptedData: string;

  @IsString()
  @IsNotEmpty()
  senderNonce: string;

  @IsString()
  @IsNotEmpty()
  senderEphemPkForSelf: string;
}
