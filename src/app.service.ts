import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      message: 'GMBT backend is live',
      status: 'success',
    };
  }
}
