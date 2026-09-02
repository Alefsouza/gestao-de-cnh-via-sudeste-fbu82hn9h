/// <reference path="../../pocketbase/migrations/0001_create_collections.js" />
migrate(
  (app) => {
    const collection = new Collection({
      name: 'sync_runs',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: [
        { name: 'started_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        { name: 'status', type: 'text' },
        { name: 'records_updated', type: 'number' },
        { name: 'error', type: 'text' },
      ],
    })
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('sync_runs')
    app.delete(collection)
  },
)
