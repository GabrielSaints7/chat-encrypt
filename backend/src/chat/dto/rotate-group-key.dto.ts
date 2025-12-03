// backend/src/chat/dto/rotate-group-key.dto.ts
import { IsNotEmpty, IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class MemberKeyDto {
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

export class RotateGroupKeyDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsNotEmpty()
  rotatedBy: string; // ID de quem está rotacionando (geralmente o admin)

  @IsNumber()
  newKeyVersion: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberKeyDto)
  memberKeys: MemberKeyDto[]; // Nova chave cifrada para cada membro restante
}
