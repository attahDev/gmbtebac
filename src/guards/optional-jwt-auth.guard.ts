import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same 'jwt' passport strategy as JwtAuthGuard, but never throws.
 *
 * Used on endpoints that must stay open to the public (accounts/login
 * aren't live yet) while still auto-attributing the request to a user
 * when they *do* happen to send a valid token — e.g. guest news comments
 * today, seamlessly becoming account-attributed comments later with no
 * further changes needed here.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // Deliberately swallow auth failures instead of the default
    // AuthGuard behaviour of throwing UnauthorizedException — return
    // whatever passport found (or null) and let the controller decide
    // what to do with an absent user.
    return user || null;
  }
}
