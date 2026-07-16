import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    // 1. Retrieve the secret using the argument 'configService' (NOT 'this.configService')
    const secret = configService.get<string>('JWT_SECRET');

    // 2. Add a runtime check for safety
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not defined.');
    }

    // 3. Call super() FIRST, passing the guaranteed string value
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
