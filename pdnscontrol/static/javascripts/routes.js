//// Router setup

App.Router.reopen({
  enableLogging: true,
  location: 'history'
});

App.Router.map(function() {
  this.resource('servers');
  this.resource('server', { path: '/server/:server_id' }, function() {
    this.route('edit'); // TODO
    this.route('stats');
    this.route('zones');
    this.route('configuration');
  });
});

//// Routes

App.IndexRoute = Ember.Route.extend({
  redirect: function() {
    this.transitionTo('servers');
  }
});

App.ServersRoute = Ember.Route.extend({
  model: function(params) {
    return App.Server.find();
  }
});

App.ServerConfigurationRoute = Ember.Route.extend({
  model: function(params) {
    return this.modelFor('server').get('config_settings');
  },
  setupController: function(controller, model) {
    this._super(controller, model);
    controller.set('server', this.modelFor('server'));
  }
});

App.ServerZonesRoute = Ember.Route.extend({
  model: function(params) {
    var server = this.modelFor('server');
    if (Ember.isEmpty(server.get('zones'))) {
      server.load_zones();
    }
    return server.get('zones');
  },
  setupController: function(controller, model) {
    this._super(controller, model);
    controller.set('server', this.modelFor('server'));
  }
});

App.ServerStatsRoute = Ember.Route.extend({
  model: function(params) {
    return this.modelFor('server').get('stats');
  },
  setupController: function(controller, model) {
    this._super(controller, model);
    controller.set('server', this.modelFor('server'));
  }
});

App.ServersController = Ember.ArrayController.extend({
  sortProperties: ['name'],

  allSelected: false,
  _allSelectedChanged: function() {
    this.get('content').setEach('isSelected', this.get('allSelected'));
  }.observes('allSelected'),

  selected_servers: function() {
    return this.get('content').
      filterProperty('isSelected', true);
  },

  flush_cache: function() {
    this.selected_servers().
      forEach(function(item) {
        item.flush_cache();
      });
  },

  search_log: function(search_text) {
    console.log(this.selected_servers());
    var messages = [];
    this.selected_servers().
      forEach(function(item) {
        // FIXME: very theoretical code
        messages += item.search_log(search_text);
      });
  },

  restart: function() {
    this.selected_servers().
      forEach(function(item) {
        item.restart();
      });
  },

  new: function() {
    // add new server to Console database
    App.ModalView.create({
      templateName: 'servers/_new',
      controller: this,
      title: 'Add Server',
      success: 'Save',

      name: null,
      kind: null,
      stats_url: null,
      manager_url: null,

      openCallback: function() {
        this.$('.name').focus();
      },

      closeCallback: function() {
        console.log(this);
        return true;
      },

      successCallback: function() {
        var that = this;

        // Ember doesn't have a RadioButtonGroupView at this point, so
        // let's take the foot path.
        this.kind = this.$('input[name=kind]')[0].checked ? 'Authoritative' : 'Recursor';
        this.spin();

        var record = App.Server.createRecord({
          name: this.name,
          stats_url: this.stats_url,
          manager_url: this.manager_url,
          kind: this.kind
        });

        record.on('didCreate', function() {
          that.close();
          // TODO: what now?
        });
        record.on('becameInvalid', function() {
          that.stopSpin();
          alert(this.errors);
        });

        record.store.commit();

        return false; // wait until completion
      }

    }).append();
  }

});


App.ServerController = Ember.ObjectController.extend({
  flush_cache: function() {
    this.get('content').flush_cache();
  },

  search_log: function(search_text) {
    this.get('content').search_log(search_text);
  },

  restart: function() {
    this.get('content').restart();
  },

});

App.SortedTableController = Ember.Table.TableController.extend({
  sortColumn: null,
  sortAscending: null,

  sortByColumn: function(column) {
    if (column.get('sortAscending') === undefined ||
        column == this.get('sortColumn')) {
      column.toggleProperty('sortAscending');
    }
    var sortAscending = column.get('sortAscending');
    this.get('columns').setEach('isSortedBy', false);
    column.set('isSortedBy', true);

    this.set('sortColumn', column);
    this.set('sortAscending', sortAscending);

    var content = this.get('content').slice();
    var sorted = content.sort(function(item1, item2) {
      var result = Ember.compare(
        column.getCellContent(item1),
        column.getCellContent(item2)
      );
      return sortAscending ? result : -result;
    });
    this.set('content', Ember.A(sorted));
  }
});

App.SortedTableColumnDefinition = Ember.Table.ColumnDefinition.extend({
  headerCellViewClass: 'App.TableHeaderCellView'
});

App.ServerConfigurationController = App.SortedTableController.extend({
  hasHeader: true,
  hasFooter: false,
  rowHeight: 30,
  numFixedColumns: 0,

  columns: function() {
    return [
      App.SortedTableColumnDefinition.create({
        headerCellName: 'Name',
        columnWidth: 250,
        getCellContent: function(row) { return row.get('name'); },
      }),
      App.SortedTableColumnDefinition.create({
        headerCellName: 'Value',
        columnWidth: 600,
        getCellContent: function(row) { return row.get('value'); },
      })
    ];
  }.property(),

});

App.ServerZonesController = App.SortedTableController.extend({
  hasHeader: true,
  hasFooter: false,
  rowHeight: 30,
  numFixedColumns: 0,

  columns: function() {
    console.log('columns setup with ', this.get('server'));
    if (this.get('server') === undefined) {
      return [];
    }
    var cols = [
      Ember.Table.ColumnDefinition.create({
        headerCellName: 'Name',
        columnWidth: 300,
        getCellContent: function(row) { return row.get('name'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      }),
      Ember.Table.ColumnDefinition.create({
        headerCellName: 'Kind',
        columnWidth: 100,
        getCellContent: function(row) { return row.get('kind'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      })
    ];

    if (this.get('server').get('kind') === 'Authoritative') {
      cols.addObject(Ember.Table.ColumnDefinition.create({
        headerCellName: 'Masters',
        columnWidth: 200,
        getCellContent: function(row) { return row.get('masters'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      }));
      cols.addObject(Ember.Table.ColumnDefinition.create({
        headerCellName: 'serial',
        columnWidth: 100,
        getCellContent: function(row) { return row.get('serial'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      }));
    } else {
      cols.addObject(Ember.Table.ColumnDefinition.create({
        headerCellName: 'Forwarders',
        columnWidth: 200,
        getCellContent: function(row) { return row.get('forwarders'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      }));
      cols.addObject(Ember.Table.ColumnDefinition.create({
        headerCellName: 'Recursion Desired',
        columnWidth: 200,
        getCellContent: function(row) { return row.get('rdbit') == 0 ? 'No' : 'Yes'; },
        headerCellViewClass: 'App.TableHeaderCellView'
      }));
    }
    return cols;
  }.property('server'),

});

App.ServerStatsController = App.SortedTableController.extend({
  hasHeader: true,
  hasFooter: false,
  rowHeight: 30,
  numFixedColumns: 0,

  columns: function() {
    return [
      Ember.Table.ColumnDefinition.create({
        headerCellName: 'Name',
        columnWidth: 250,
        getCellContent: function(row) { return row.get('name'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      }),
      Ember.Table.ColumnDefinition.create({
        headerCellName: 'Value',
        columnWidth: 600,
        getCellContent: function(row) { return row.get('value'); },
        headerCellViewClass: 'App.TableHeaderCellView'
      })
    ];
  }.property(),

});
