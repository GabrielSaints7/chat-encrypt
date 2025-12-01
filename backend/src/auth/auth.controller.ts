/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Get,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('user/:userId')
  async getUserById(@Param('userId') userId: string) {
    const user = await this.authService.getUserById(userId);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      publicKey: user.publicKeys[0]?.publicKey,
    };
  }

  @Get('user/email/:email')
  async getUserByEmail(@Param('email') email: string) {
    const user = await this.authService.getUserByEmail(email);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      publicKey: user.publicKeys[0]?.publicKey,
    };
  }
}
