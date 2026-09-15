migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    // Permite que qualquer usuário autenticado edite seu próprio registro OU usuários com role Admin editem qualquer usuário
    usersCol.updateRule =
      '@request.auth.id != "" && (id = @request.auth.id || @request.auth.role = "Admin")'
    app.save(usersCol)
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      usersCol.updateRule = 'id = @request.auth.id'
      app.save(usersCol)
    } catch (_) {}
  },
)
