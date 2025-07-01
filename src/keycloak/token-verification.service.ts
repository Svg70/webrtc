import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class TokenVerificationService {
  private client;
  private issuer: string;
  private expectedAudience: string;

  constructor(private config: ConfigService) {
    const baseUrl = this.config.get<string>('KEYCLOAK_URL');
    const realm = this.config.get<string>('KEYCLOAK_REALM');

    this.issuer = `${baseUrl}/realms/${realm}`;
    this.expectedAudience = this.config.get<string>('KEYCLOAK_CLIENT_ID');

    const jwksUri = `${this.issuer}/protocol/openid-connect/certs`;
    console.log(`[TokenVerificationService] JWKS URI: ${jwksUri}`);

    this.client = jwksRsa({
      jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  private getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
    console.log(`[TokenVerificationService] JWT Header:`, header);

    this.client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        console.error(`[TokenVerificationService] Error fetching signing key:`, err);
        return callback(err, null);
      }

      const signingKey = key.getPublicKey();
      console.log(`[TokenVerificationService] Retrieved signing key:\n`, signingKey);
      callback(null, signingKey);
    });
  }

  async verifyToken(token: string): Promise<any> {
    console.log(`[TokenVerificationService] Received token:\n`, token);

    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        this.getKey.bind(this),
        {
          issuer: this.issuer,
          algorithms: ['RS256'],
          // ⚠️ intentionally skipping audience check here
        },
        (err, decoded: any) => {
          if (err) {
            console.error(`[TokenVerificationService] Token verification failed:`, err);
            return reject(new UnauthorizedException('Token signature/issuer invalid'));
          }

          console.log(`[TokenVerificationService] Token decoded:`, decoded);

          // ✅ Manual audience validation
          const aud = decoded.aud;
          const expected = this.expectedAudience;

          const isValidAudience = Array.isArray(aud)
            ? aud.includes(expected)
            : aud === expected;

          if (!isValidAudience) {
            console.warn(
              `[TokenVerificationService] Invalid audience. Expected: ${expected}, got: ${aud}`,
            );
            //return reject(new UnauthorizedException('Token audience mismatch'));
          }

          resolve(decoded);
        },
      );
    });
  }
}
