import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    const { name, email, phone, password, publicKey } = registerDto;

    console.log('[AUTH] Iniciando registro de usuário:', email);

    // Verificar se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(' [AUTH] Email já cadastrado:', email);
      throw new ConflictException('Email já cadastrado');
    }

    // Hash da senha
    console.log('[AUTH] Gerando hash da senha...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('[AUTH] Hash da senha gerado');

    // Criar usuário
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        publicKeys: {
          create: {
            publicKey: publicKey, // Armazenar chave pública temporariamente como UUID
            deviceId: 'default',
          },
        },
      },
      include: {
        publicKeys: true,
      },
    });

    console.log('[AUTH] Usuário criado com sucesso:', user.id);
    console.log(
      '[AUTH] Chave pública armazenada:',
      publicKey.substring(0, 20) + '...',
    );

    // Salvar chave pública
    await this.prisma.publicKey.create({
      data: {
        userId: user.id,
        publicKey: registerDto.publicKey,
        deviceId: 'web-browser',
      },
    });

    console.log('[AUTH] Chave pública armazenada');

    // SALVAR CHAVE PRIVADA CIFRADA
    if (registerDto.encryptedPrivateKey && registerDto.salt && registerDto.iv) {
      await this.prisma.privateKey.create({
        data: {
          userId: user.id,
          encryptedPrivateKey: registerDto.encryptedPrivateKey,
          salt: registerDto.salt,
          iv: registerDto.iv,
          deviceId: 'web-browser',
        },
      });

      console.log('[AUTH] Chave privada cifrada armazenada');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      publicKey: user.publicKeys[0].publicKey,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    console.log('[AUTH] Tentativa de login:', email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        publicKeys: true, // Inclui as chaves públicas
        privateKeys: true, // Inclui as chaves privadas
      },
    });

    if (!user) {
      console.log(' [AUTH] Usuário não encontrado:', email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(' [AUTH] Senha incorreta para:', email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    console.log('[AUTH] Login bem-sucedido:', user.name);

    // RETORNAR CHAVE PRIVADA CIFRADA
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      publicKey: user.publicKeys[0]?.publicKey,
      encryptedPrivateKey: user.privateKeys[0]?.encryptedPrivateKey, // ADICIONAR
      salt: user.privateKeys[0]?.salt, // ADICIONAR
      iv: user.privateKeys[0]?.iv, // ADICIONAR
    };
  }

  async getUserByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: { email },
      include: {
        publicKeys: true,
      },
    });
  }

  async getUserById(id: string) {
    return await this.prisma.user.findUnique({
      where: { id },
      include: {
        publicKeys: true,
      },
    });
  }
}
