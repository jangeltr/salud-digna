import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse,
  ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccountDto } from '../auth/auth.dto';
import { CurrentUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Channel, UserRole } from '../generated/prisma/enums';
import { webSession } from '../requests/request-origin';
import { ConversationMessageDto, ConversationReplyDto, SelectionAction } from './conversation.dto';
import { ConversationService } from './conversation.service';

const requestId = '00000000-0000-4000-8000-000000000001';

@ApiTags('Conversation · Development')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.PATIENT])
@Controller('conversations/dev')
export class ConversationController {
  constructor(private readonly conversation: ConversationService) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simular un mensaje de WhatsApp para el paciente autenticado' })
  @ApiBody({
    type: ConversationMessageDto,
    examples: {
      greeting: { value: { message: 'Hola' } },
      resume: { value: { message: 'Quiero continuar mi solicitud' } },
      status: { value: { message: '¿Cuál es el estado de mi solicitud?', requestId } },
      selectStudy: {
        value: {
          message: 'Elijo este estudio', requestId, version: 1,
          action: { type: SelectionAction.SELECT_STUDY, value: '00000000-0000-4000-8000-000000000201' },
        },
      },
      advisor: { value: { message: 'Quiero hablar con un asesor', requestId } },
    },
  })
  @ApiOkResponse({ type: ConversationReplyDto })
  @ApiBadRequestResponse({ description: 'Mensaje, selección, versión o destino inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Se requiere un JWT activo.' })
  @ApiForbiddenResponse({ description: 'Se requiere el rol PATIENT y un perfil asociado.' })
  @ApiNotFoundResponse({ description: 'Ruta deshabilitada, solicitud inexistente o solicitud de otro paciente.' })
  @ApiConflictResponse({
    description: 'Versión desactualizada o solicitud cerrada.',
    schema: { example: { statusCode: 409, message: 'La versión cambió. Recupera el estado actualizado de la solicitud.', error: 'Conflict' } },
  })
  message(@CurrentUser() user: AccountDto, @Body() input: ConversationMessageDto): Promise<ConversationReplyDto> {
    const { patientId, actorUserId } = webSession(user);
    return this.conversation.respond({ channel: Channel.WHATSAPP, simulated: true, patientId, actorUserId }, input);
  }
}
