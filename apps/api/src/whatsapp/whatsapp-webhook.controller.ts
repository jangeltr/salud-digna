import { Controller, Get, Header, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBody, ApiForbiddenResponse, ApiHeader, ApiOkResponse, ApiOperation,
  ApiPayloadTooLargeResponse, ApiQuery, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookVerifier } from './whatsapp-webhook-verifier';

@ApiTags('WhatsApp Webhook')
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly verifier: WhatsAppWebhookVerifier,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Verificar el callback de Meta' })
  @ApiQuery({ name: 'hub.mode', example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token', description: 'Token de verificación de la integración.' })
  @ApiQuery({ name: 'hub.challenge', example: '00123456' })
  @ApiOkResponse({ content: { 'text/plain': { schema: { type: 'string', example: '00123456' } } } })
  @ApiForbiddenResponse({ description: 'Modo, token o challenge inválidos.' })
  challenge(
    @Query('hub.mode') mode: unknown,
    @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') challenge: unknown,
  ): string {
    return this.verifier.challenge(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Aceptar notificaciones firmadas de WhatsApp Cloud API' })
  @ApiHeader({ name: 'X-Hub-Signature-256', required: true, description: 'HMAC-SHA256 de los bytes originales, con prefijo sha256=.' })
  @ApiBody({ schema: { type: 'object', example: { object: 'whatsapp_business_account', entry: [] } } })
  @ApiOkResponse({ description: 'Notificación aceptada. Los mensajes admitidos se guardaron para procesarlos después.' })
  @ApiUnauthorizedResponse({ description: 'Firma ausente o inválida.' })
  @ApiBadRequestResponse({ description: 'La notificación autenticada contiene JSON inválido.' })
  @ApiPayloadTooLargeResponse({ description: 'El webhook supera 256 KiB.' })
  async receive(@Req() request: { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: unknown): Promise<void> {
    const body = request.rawBody;
    this.verifier.verify(body, signature);
    await this.whatsapp.accept(body);
  }
}
