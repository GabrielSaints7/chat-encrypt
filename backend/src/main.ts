import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configurar WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Habilitar CORS
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  // Habilitar validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Chat Seguro')
    .setDescription(
      'Api para um aplicativo de chat seguro com criptografia de ponta a ponta',
    )
    .setVersion('1.0')
    .addTag('chat-seguro')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
  console.log('[deploy] Servidor NestJS rodando em http://localhost:3000/api');
  console.log('[deploy] WebSocket disponível em ws://localhost:3000');
}
bootstrap();
