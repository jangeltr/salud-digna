import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const response = host.switchToHttp().getResponse();
    this.adapterHost.httpAdapter.reply(response, {
      statusCode,
      message: STATUS_CODES[statusCode] ?? 'Request failed',
    }, statusCode);
  }
}
