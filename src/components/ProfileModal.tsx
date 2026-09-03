import { useEffect, useRef, useState } from 'react'
import { ClientResponseError } from 'pocketbase'
import { toast } from 'sonner'
import {
  Camera,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { initials } from '@/lib/format'
import { extractFieldErrors } from '@/lib/pocketbase/errors'
import { changePassword, getUserAvatarUrl, updateProfile } from '@/services/user'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user } = useAuth()

  // Tab ativa
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile')

  // Estado do formulário de Perfil (Nome & Foto)
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [removeAvatarRequested, setRemoveAvatarRequested] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado do formulário de Senha
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // URL do avatar salvo no servidor
  const savedAvatarUrl = getUserAvatarUrl(user)

  // Inicializa os dados quando o modal abre ou o usuário muda
  useEffect(() => {
    if (open) {
      setName(user?.name || '')
      setAvatarFile(null)
      setAvatarPreviewUrl(null)
      setRemoveAvatarRequested(false)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordError(null)
      setActiveTab('profile')
    }
  }, [open, user])

  // Limpeza de URL temporária de objeto do browser
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

  // Handler para seleção de imagem
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validações básicas (formato e tamanho de até 5MB)
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem selecionada é muito grande. O tamanho máximo permitido é 5MB.')
      return
    }

    if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }

    const preview = URL.createObjectURL(file)
    setAvatarFile(file)
    setAvatarPreviewUrl(preview)
    setRemoveAvatarRequested(false)
  }

  // Handler para remover a foto selecionada ou existente
  const handleRemovePhoto = () => {
    if (avatarPreviewUrl && avatarPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }
    setAvatarFile(null)
    setAvatarPreviewUrl(null)
    setRemoveAvatarRequested(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Preview ativo a ser mostrado no Avatar
  const currentAvatarSrc =
    avatarPreviewUrl || (removeAvatarRequested ? undefined : (savedAvatarUrl ?? undefined))

  // Salvar alterações de perfil (Nome e Foto)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (!name.trim()) {
      toast.error('O nome não pode ficar em branco.')
      return
    }

    setSavingProfile(true)
    try {
      let avatarParam: File | null | undefined = undefined
      if (removeAvatarRequested) {
        avatarParam = null
      } else if (avatarFile) {
        avatarParam = avatarFile
      }

      await updateProfile(user.id, {
        name: name.trim(),
        ...(avatarParam !== undefined ? { avatar: avatarParam } : {}),
      })

      toast.success('Perfil atualizado com sucesso!')
      onOpenChange(false)
    } catch (err: unknown) {
      let errorMsg = 'Não foi possível atualizar o perfil. Tente novamente.'
      if (err instanceof ClientResponseError) {
        const fieldErrors = extractFieldErrors(err)
        if (fieldErrors.name) {
          errorMsg = `Nome inválido: ${fieldErrors.name}`
        } else if (fieldErrors.avatar) {
          errorMsg = `Foto inválida: ${fieldErrors.avatar}`
        } else if (err.message) {
          errorMsg = err.message
        }
      }
      toast.error(errorMsg)
    } finally {
      setSavingProfile(false)
    }
  }

  // Salvar alteração de senha
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)

    if (!user) return

    if (!oldPassword) {
      setPasswordError('Informe a sua senha atual.')
      return
    }

    if (!newPassword) {
      setPasswordError('Informe a nova senha.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não coincide.')
      return
    }

    if (oldPassword === newPassword) {
      setPasswordError('A nova senha deve ser diferente da senha atual.')
      return
    }

    setSavingPassword(true)
    try {
      await changePassword(user.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword,
      })

      toast.success('Senha alterada com sucesso!')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onOpenChange(false)
    } catch (err: unknown) {
      let friendlyMessage = 'Erro ao alterar a senha. Verifique os dados informados.'
      if (err instanceof ClientResponseError) {
        const fieldErrors = extractFieldErrors(err)
        if (fieldErrors.oldPassword) {
          friendlyMessage = 'A senha atual informada está incorreta.'
        } else if (fieldErrors.password) {
          friendlyMessage = `Nova senha inválida: ${fieldErrors.password}`
        } else if (fieldErrors.passwordConfirm) {
          friendlyMessage = 'A confirmação de senha não confere.'
        } else if (err.status === 400) {
          friendlyMessage =
            'Senha atual incorreta ou requisitos de senha não atendidos (mínimo de 8 caracteres).'
        }
      }
      setPasswordError(friendlyMessage)
      toast.error(friendlyMessage)
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <User className="h-5 w-5 text-primary" />
            Meu Perfil
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Gerencie suas informações pessoais, foto de identificação e segurança de acesso.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'profile' | 'security')}
          className="mt-2 w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/60">
            <TabsTrigger value="profile" className="flex items-center gap-2 text-xs font-medium">
              <User className="h-3.5 w-3.5" />
              Dados e Foto
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2 text-xs font-medium">
              <KeyRound className="h-3.5 w-3.5" />
              Alterar Senha
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: DADOS E FOTO */}
          <TabsContent value="profile" className="mt-4 space-y-5">
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Seção do Avatar com Upload e Ações */}
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-2 border-primary/20 shadow-sm transition-all duration-200">
                    {currentAvatarSrc && (
                      <AvatarImage
                        src={currentAvatarSrc}
                        alt={name || user?.name || 'Foto do usuário'}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-primary text-xl font-bold text-white uppercase">
                      {initials(name || user?.name || 'Admin')}
                    </AvatarFallback>
                  </Avatar>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Alterar foto"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Camera className="h-6 w-6" />
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs font-medium gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {currentAvatarSrc ? 'Trocar foto' : 'Enviar foto'}
                  </Button>

                  {currentAvatarSrc && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      className="h-8 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover foto
                    </Button>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground text-center">
                  Formatos aceitos: JPG, PNG ou WEBP (máximo 5MB).
                </p>
              </div>

              {/* Informações de texto */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name" className="text-xs font-semibold text-foreground">
                    Nome Completo <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="profile-name"
                    type="text"
                    required
                    placeholder="Ex: Carlos Alberto Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="profile-email" className="text-xs font-semibold text-foreground">
                    E-mail institucional
                  </Label>
                  <Input
                    id="profile-email"
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="h-9 bg-muted/50 text-xs text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    O e-mail de acesso é gerenciado pela administração do sistema.
                  </p>
                </div>
              </div>

              {/* Ações do rodapé da aba */}
              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={savingProfile}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingProfile}
                  className="bg-primary text-white hover:bg-primary/90 gap-1.5"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Salvar alterações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* TAB 2: SEGURANÇA / ALTERAÇÃO DE SENHA */}
          <TabsContent value="security" className="mt-4 space-y-5">
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                <p className="font-semibold">Dica de segurança</p>
                <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-300/80">
                  A nova senha deve possuir no mínimo 8 caracteres. Recomendamos mesclar letras,
                  números e símbolos.
                </p>
              </div>

              {passwordError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  {passwordError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="old-password" className="text-xs font-semibold text-foreground">
                  Senha Atual <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="old-password"
                    type={showOldPassword ? 'text' : 'password'}
                    required
                    placeholder="Digite sua senha atual"
                    value={oldPassword}
                    onChange={(e) => {
                      setOldPassword(e.target.value)
                      if (passwordError) setPasswordError(null)
                    }}
                    className="h-9 pr-9 text-sm"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showOldPassword ? 'Ocultar senha atual' : 'Exibir senha atual'}
                    onClick={() => setShowOldPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-semibold text-foreground">
                  Nova Senha <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      if (passwordError) setPasswordError(null)
                    }}
                    className="h-9 pr-9 text-sm"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'}
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-semibold text-foreground">
                  Confirmar Nova Senha <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (passwordError) setPasswordError(null)
                    }}
                    className="h-9 pr-9 text-sm"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={
                      showConfirmPassword
                        ? 'Ocultar confirmação de senha'
                        : 'Exibir confirmação de senha'
                    }
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Ações do rodapé da aba */}
              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={savingPassword}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingPassword}
                  className="bg-primary text-white hover:bg-primary/90 gap-1.5"
                >
                  {savingPassword ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Atualizando…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Alterar senha
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
