import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { TokenVerificationService } from 'src/keycloak/token-verification.service'; // ты сам пишешь это

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake.auth?.token;

    if (!token) throw new WsException('Missing token');

    try {
      const user = await this.tokenVerifier.verifyToken(token); // ты сам реализуешь это
      (client as any).user = user; // <--- важно
      return true;
    } catch (err) {
      throw new WsException('Invalid token');
    }
  }
}
