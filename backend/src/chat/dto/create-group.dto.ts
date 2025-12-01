// backend/src/chat/dto/create-group.dto.ts
import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  creatorId: string;

  @IsArray()
  @IsNotEmpty()
  members: MemberKeyDto[]; // Incluir o criador
}

export class MemberKeyDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  encryptedGroupKey: string;

  @IsString()
  @IsNotEmpty()
  ephemeralPublicKey: string;
}
