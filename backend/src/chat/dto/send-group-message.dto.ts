// backend/src/chat/dto/send-group-message.dto.ts
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';

export class SendGroupMessageDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  encryptedData: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;

  @IsNumber()
  keyVersion: number;
}
