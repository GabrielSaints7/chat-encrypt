// backend/src/chat/dto/add-member.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class AddMemberDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  encryptedGroupKey: string;

  @IsString()
  @IsNotEmpty()
  ephemeralPublicKey: string;

  @IsString()
  @IsNotEmpty()
  addedBy: string; // ID de quem está adicionando
}
