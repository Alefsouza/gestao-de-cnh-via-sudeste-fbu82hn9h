import type { RecordSubscription } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import type { Employee } from '@/lib/types'

export interface ConversationRecord {
  id: string
  user: string
  title: string
  created: string
  updated: string
}

export interface MessageMetadata {
  exportableRows?: Employee[]
  exportFileName?: string
  exportSheetName?: string
  matchedEmployee?: Employee
  downloadTriggered?: boolean
}

export interface MessageRecord {
  id: string
  conversation: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: MessageMetadata
  created: string
  updated: string
}

const CONVERSATIONS_COLLECTION = 'conversations'
const MESSAGES_COLLECTION = 'messages'

/**
 * Lista as conversas do usuário atual ordenadas pela última atualização descendente.
 */
export async function listConversations(): Promise<ConversationRecord[]> {
  return pb.collection<ConversationRecord>(CONVERSATIONS_COLLECTION).getFullList({
    sort: '-updated',
  })
}

/**
 * Cria uma nova conversa para o usuário atual.
 */
export async function createConversation(
  title: string,
  userId: string,
): Promise<ConversationRecord> {
  return pb.collection<ConversationRecord>(CONVERSATIONS_COLLECTION).create({
    user: userId,
    title: title.trim() || 'Nova conversa',
  })
}

/**
 * Renomeia o título de uma conversa.
 */
export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<ConversationRecord> {
  return pb.collection<ConversationRecord>(CONVERSATIONS_COLLECTION).update(id, {
    title: title.trim() || 'Sem título',
  })
}

/**
 * Exclui uma conversa (e por cascata no PocketBase suas mensagens).
 */
export async function deleteConversation(id: string): Promise<boolean> {
  return pb.collection(CONVERSATIONS_COLLECTION).delete(id)
}

/**
 * Lista todas as mensagens de uma conversa em ordem cronológica crescente.
 */
export async function listMessagesByConversation(conversationId: string): Promise<MessageRecord[]> {
  return pb.collection<MessageRecord>(MESSAGES_COLLECTION).getFullList({
    filter: `conversation = "${conversationId}"`,
    sort: 'created',
  })
}

/**
 * Cria uma mensagem na conversa e atualiza o timestamp da conversa.
 */
export async function createMessage(params: {
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: MessageMetadata
}): Promise<MessageRecord> {
  const message = await pb.collection<MessageRecord>(MESSAGES_COLLECTION).create({
    conversation: params.conversationId,
    role: params.role,
    content: params.content,
    metadata: params.metadata || {},
  })

  // Dispara atualização na conversa para refletir no sort '-updated'
  try {
    await pb.collection(CONVERSATIONS_COLLECTION).update(params.conversationId, {
      updated: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('Falha ao atualizar timestamp da conversa:', err)
  }

  return message
}

/**
 * Inscreve-se em mudanças em tempo real na coleção conversations.
 */
export function subscribeConversations(
  callback: (data: RecordSubscription<ConversationRecord>) => void,
) {
  return pb.collection<ConversationRecord>(CONVERSATIONS_COLLECTION).subscribe('*', callback)
}
