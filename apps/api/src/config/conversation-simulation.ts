export function conversationSimulationEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.CONVERSATION_SIMULATOR_ENABLED === 'true';
}
