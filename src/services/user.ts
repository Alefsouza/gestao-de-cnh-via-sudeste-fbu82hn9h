import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export interface UpdateProfileData {
  name?: string
  avatar?: File | null // null will clear/delete avatar
}

export interface ChangePasswordData {
  oldPassword: string
  password: string
  passwordConfirm: string
}

/**
 * Retorna a URL da foto de perfil do usuário, se houver
 */
export function getUserAvatarUrl(
  user: AuthRecord | null | undefined,
  thumb?: string,
): string | null {
  if (!user || !user.avatar) return null
  return pb.files.getURL(user, user.avatar as string, thumb ? { thumb } : undefined)
}

/**
 * Atualiza o perfil do usuário atual (nome e/ou avatar)
 */
export async function updateProfile(userId: string, data: UpdateProfileData): Promise<AuthRecord> {
  const formData = new FormData()

  if (data.name !== undefined) {
    formData.append('name', data.name.trim())
  }

  if (data.avatar === null) {
    // Para remover o arquivo no PocketBase
    formData.append('avatar', '')
  } else if (data.avatar instanceof File) {
    formData.append('avatar', data.avatar)
  }

  const updatedRecord = await pb.collection('users').update(userId, formData)

  // Atualiza o authStore com o novo registro caso seja o usuário logado
  if (pb.authStore.record?.id === userId) {
    pb.authStore.save(pb.authStore.token, updatedRecord)
  }

  return updatedRecord
}

/**
 * Altera a senha do usuário autenticado no PocketBase
 */
export async function changePassword(
  userId: string,
  data: ChangePasswordData,
): Promise<AuthRecord> {
  const updatedRecord = await pb.collection('users').update(userId, {
    oldPassword: data.oldPassword,
    password: data.password,
    passwordConfirm: data.passwordConfirm,
  })

  // Ao alterar a senha no PocketBase, o token permanece válido se mantido no authStore
  if (pb.authStore.record?.id === userId) {
    pb.authStore.save(pb.authStore.token, updatedRecord)
  }

  return updatedRecord
}
