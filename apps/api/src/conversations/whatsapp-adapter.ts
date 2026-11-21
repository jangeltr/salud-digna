import type { WhatsAppRequestOrigin } from '../requests/request-origin';
import type { ConversationMessageDto, ConversationReplyDto } from './conversation.dto';

export interface VerifiedWhatsAppMessage {
  providerMessageId: string;
  origin: Extract<WhatsAppRequestOrigin, { externalId: string }>;
  input: ConversationMessageDto;
}

export interface WhatsAppAdapter {
  // Valida el evento del proveedor antes de devolver la identidad y la entrada normalizada.
  receive(event: unknown): Promise<VerifiedWhatsAppMessage>;
  deliver(message: VerifiedWhatsAppMessage, response: ConversationReplyDto): Promise<void>;
}
