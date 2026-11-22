import { Controller, Header, Headers, HttpCode, Inject, Post, Req, UnsupportedMediaTypeException } from '@nestjs/common';
import { ApiConsumes, ApiHeader, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { normalizeTwilio, verifyTwilioForm } from './twilio-webhook';
import { WHATSAPP_CONFIG, type TwilioConfig } from './whatsapp.config';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('WhatsApp Webhook')
@Controller('webhooks/twilio/whatsapp')
export class TwilioWebhookController {
  constructor(
    @Inject(WHATSAPP_CONFIG) private readonly config: TwilioConfig,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Content-Type', 'text/xml; charset=utf-8')
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiHeader({ name: 'X-Twilio-Signature', required: true })
  @ApiOkResponse({ description: 'TwiML vacío tras aceptar el mensaje para procesamiento asíncrono.' })
  @ApiUnauthorizedResponse({ description: 'Firma ausente o inválida.' })
  async receive(
    @Req() request: { rawBody?: Buffer; originalUrl: string },
    @Headers('x-twilio-signature') signature: unknown,
    @Headers('content-type') contentType?: string,
  ): Promise<string> {
    if (contentType?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
      throw new UnsupportedMediaTypeException();
    }
    const form = verifyTwilioForm(request.rawBody, signature, request.originalUrl, this.config);
    const message = normalizeTwilio(form, this.config);
    if (message) await this.whatsapp.enqueue([message]);
    return '<Response></Response>';
  }
}
