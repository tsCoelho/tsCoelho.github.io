# 07 — Frontend: SAP UI5 & Fiori Elements

CAP backends pair with SAP UI5 frontends. The choice between **Fiori Elements** and **Freestyle UI5** depends on the use case — understand both and choose intentionally.

---

## Fiori Elements vs Freestyle UI5

| | Fiori Elements | Freestyle UI5 |
|--|---------------|---------------|
| **Use when** | Standard CRUD, reporting, list/detail patterns | Complex custom UI, non-standard UX flows |
| **Effort** | Low — annotations drive the UI | High — full control, full responsibility |
| **Customization** | Limited to annotation-supported patterns | Unlimited |
| **Upgrade cost** | Low (SAP maintains the floorplans) | High (custom code ages with each SAPUI5 update) |
| **Performance** | Optimized by SAP | Depends on implementation |

**Default to Fiori Elements.** Switch to Freestyle only when Fiori Elements provably cannot meet the requirement.

---

## Fiori Elements

### Supported Floorplans

| Floorplan | OData Annotation | Use Case |
|-----------|-----------------|----------|
| List Report + Object Page | `@UI.LineItem`, `@UI.FieldGroup` | Master-detail browse |
| Worklist | `@UI.LineItem` | Task lists, simple reports |
| Analytical List Page | `@UI.Chart`, `@UI.PresentationVariant` | Data analysis |
| Overview Page | `@UI.Card` | Dashboard |
| Form Entry | `@UI.FieldGroup` | Simple data entry |

### Annotation-Driven Development Workflow

1. Define the entity in `db/schema.cds`
2. Expose it in a service in `srv/`
3. Add UI annotations in `srv/*-fiori.cds`
4. Run `cds watch` — Fiori Elements renders automatically

```cds
// srv/catalog-service-fiori.cds
using CatalogService from './catalog-service';

// ── List Report ───────────────────────────────────────────────────────
annotate CatalogService.Orders with @(
  UI.LineItem: [
    { Value: ID,             Label: 'Order ID'  },
    { Value: status,         Label: 'Status'    },
    { Value: customer.name,  Label: 'Customer'  },
    { Value: createdAt,      Label: 'Created'   },
    {
      $Type: 'UI.DataFieldForAction',
      Action: 'CatalogService.submitOrder',
      Label: 'Submit'
    }
  ],
  UI.SelectionFields: [status, customer_ID],
  UI.PresentationVariant: {
    SortOrder: [{ Property: createdAt, Descending: true }]
  }
);

// ── Object Page Header ────────────────────────────────────────────────
annotate CatalogService.Orders with @(
  UI.HeaderInfo: {
    TypeName: 'Order',
    TypeNamePlural: 'Orders',
    Title: { Value: ID },
    Description: { Value: status }
  },
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Summary' }
  ]
);

// ── Field Groups ──────────────────────────────────────────────────────
annotate CatalogService.Orders with @(
  UI.FieldGroup #Summary: {
    Label: 'Summary',
    Data: [
      { Value: status },
      { Value: customer.name },
      { Value: createdAt }
    ]
  },
  UI.FieldGroup #Items: {
    Label: 'Line Items',
    Data: [
      { Value: items.product.name },
      { Value: items.quantity },
      { Value: items.unitPrice }
    ]
  },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Summary', Label: 'Summary' },
    { $Type: 'UI.ReferenceFacet', Target: 'items/@UI.LineItem',     Label: 'Items'   }
  ]
);

// ── Field-Level Annotations ───────────────────────────────────────────
annotate CatalogService.Orders with {
  status @(
    UI.Hidden: false,
    Common.ValueList: {
      CollectionPath: 'OrderStatuses',
      Parameters: [
        { $Type: 'Common.ValueListParameterOut', LocalDataProperty: status, ValueListProperty: 'code' }
      ]
    }
  );
}
```

---

## Freestyle UI5 Structure

When Fiori Elements is not sufficient, use this structure:

```
app/my-app/
└── webapp/
    ├── controller/
    │   ├── BaseController.js     # Common controller functions
    │   ├── App.controller.js
    │   ├── List.controller.js
    │   └── Detail.controller.js
    ├── view/
    │   ├── App.view.xml
    │   ├── List.view.xml
    │   └── Detail.view.xml
    ├── model/
    │   ├── models.js             # Model initialization
    │   └── formatter.js         # Value formatters
    ├── i18n/
    │   ├── i18n.properties       # Default (English)
    │   └── i18n_de.properties    # German
    ├── fragment/
    │   └── ConfirmDialog.fragment.xml
    ├── css/
    │   └── style.css             # Minimal custom CSS only
    ├── manifest.json
    └── index.html
```

### Controller Rules

```js
// webapp/controller/BaseController.js
sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/ui/core/routing/History'
], function (Controller, History) {
  'use strict';

  return Controller.extend('com.company.app.controller.BaseController', {

    // Navigation helpers — shared across all controllers
    getRouter() {
      return this.getOwnerComponent().getRouter();
    },

    getModel(sName) {
      return this.getView().getModel(sName) || this.getOwnerComponent().getModel(sName);
    },

    setModel(oModel, sName) {
      return this.getView().setModel(oModel, sName);
    },

    navigateTo(sRouteName, oParameters) {
      this.getRouter().navTo(sRouteName, oParameters);
    },

    navBack() {
      const oHistory = History.getInstance();
      const sPreviousHash = oHistory.getPreviousHash();
      if (sPreviousHash !== undefined) {
        window.history.go(-1);
      } else {
        this.navigateTo('home');
      }
    },

    showErrorMessage(sMessage) {
      sap.m.MessageBox.error(sMessage);
    }
  });
});
```

```js
// webapp/controller/List.controller.js
sap.ui.define([
  './BaseController',
  'sap/ui/model/Filter',
  'sap/ui/model/FilterOperator'
], function (BaseController, Filter, FilterOperator) {
  'use strict';

  return BaseController.extend('com.company.app.controller.List', {

    onInit() {
      // Bind routing events here
      this.getRouter().getRoute('list').attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched() {
      this._loadData();
    },

    _loadData() {
      // Bind the list directly via OData binding — avoid manual $.ajax calls
      const oList = this.byId('orderList');
      oList.bindItems({
        path: '/Orders',
        parameters: {
          $select: 'ID,status,customer/name,createdAt',
          $expand: 'customer'
        },
        sorter: new sap.ui.model.Sorter('createdAt', true)
      });
    },

    onSearch(oEvent) {
      const sQuery = oEvent.getParameter('query');
      const oList = this.byId('orderList');
      const oBinding = oList.getBinding('items');

      const aFilters = sQuery
        ? [new Filter('customer/name', FilterOperator.Contains, sQuery)]
        : [];

      oBinding.filter(aFilters);
    },

    onItemPress(oEvent) {
      const oItem = oEvent.getParameter('listItem');
      const sOrderID = oItem.getBindingContext().getProperty('ID');
      this.navigateTo('detail', { orderID: sOrderID });
    }
  });
});
```

### View Rules

```xml
<!-- webapp/view/List.view.xml -->
<mvc:View
  controllerName="com.company.app.controller.List"
  xmlns:mvc="sap.ui.core.mvc"
  xmlns="sap.m"
  displayBlock="true">

  <Page title="{i18n>ordersTitle}" showNavButton="false">
    <subHeader>
      <Bar>
        <contentRight>
          <SearchField
            id="searchField"
            search=".onSearch"
            placeholder="{i18n>searchPlaceholder}"
            width="20rem" />
        </contentRight>
      </Bar>
    </subHeader>

    <content>
      <List
        id="orderList"
        mode="SingleSelectMaster"
        itemPress=".onItemPress"
        growing="true"
        growingThreshold="50"
        noDataText="{i18n>noOrdersFound}">
        <items>
          <ObjectListItem
            title="{ID}"
            intro="{customer/name}"
            number="{status}">
          </ObjectListItem>
        </items>
      </List>
    </content>
  </Page>
</mvc:View>
```

---

## OData Binding Best Practices

```js
// GOOD — Use OData binding, not manual HTTP calls
oList.bindItems({ path: '/Orders', parameters: { $expand: 'customer' } });

// GOOD — Read via binding context
const sStatus = oContext.getProperty('status');

// BAD — Manual AJAX/fetch to the OData service
fetch('/catalog/Orders').then(r => r.json()).then(data => { ... });
// ^ Bypasses OData client, breaks batching, loses type information

// GOOD — OData batch for multiple writes
const oModel = this.getModel();
oModel.setDeferredGroups(['myBatch']);
oModel.create('/Orders', oData, { groupId: 'myBatch' });
oModel.create('/Orders', oData2, { groupId: 'myBatch' });
oModel.submitChanges({ groupId: 'myBatch' });
```

---

## Warning: Do Not Copy OData Data into JSON Models

Loading data from the OData model into a client-side JSON model is a common anti-pattern that silently breaks the OData binding lifecycle.

**The problem:**

```js
// BAD — Reading OData data and copying it into a JSON model
const oModel = this.getModel();
oModel.read('/Orders', {
  success: function(oData) {
    const oJsonModel = new sap.ui.model.json.JSONModel(oData.results);
    this.getView().setModel(oJsonModel, 'orders');
  }.bind(this)
});
```

This bypasses the OData client entirely:

- Two-way binding to the backend is lost — edits do not propagate back via `submitChanges`
- OData type information, formatting, and currency/unit handling are lost
- Delta tracking and deferred groups no longer apply
- The data becomes a stale snapshot that diverges from the server state

**When JSON models ARE appropriate:**

Use a JSON model only for data that is **not** sourced from the OData backend:

- UI state flags (`{ busy: false, editMode: false }`)
- Static dropdown options or configuration values
- Visualization control data (chart axis ranges, toggle states)
- Transient form input before it is validated and submitted

```js
// GOOD — JSON model for local UI state only
const oViewModel = new sap.ui.model.json.JSONModel({
  busy: false,
  editMode: false,
  selectedTab: 'overview'
});
this.getView().setModel(oViewModel, 'viewModel');

// GOOD — OData data stays in the OData model, bound declaratively
oList.bindItems({
  path: '/Orders',
  parameters: { $select: 'ID,status', $expand: 'customer' }
});
```

---

## Internationalization (i18n)

Every user-visible string must be in i18n files. No hardcoded strings in views or controllers.

```properties
# webapp/i18n/i18n.properties
ordersTitle=Orders
searchPlaceholder=Search by customer...
noOrdersFound=No orders found
submitOrderTitle=Submit Order
submitOrderConfirm=Are you sure you want to submit this order?
errorLoadingOrders=Failed to load orders. Please try again.
```

```xml
<!-- Bind in view -->
<Page title="{i18n>ordersTitle}">
```

```js
// Access in controller
const sMessage = this.getModel('i18n').getResourceBundle().getText('submitOrderConfirm');
```

---

## `manifest.json` Structure

```json
{
  "_version": "1.65.0",
  "sap.app": {
    "id": "com.company.catalog",
    "type": "application",
    "title": "{{appTitle}}",
    "description": "{{appDescription}}",
    "applicationVersion": { "version": "1.0.0" },
    "dataSources": {
      "mainService": {
        "uri": "/catalog/",
        "type": "OData",
        "settings": { "odataVersion": "4.0" }
      }
    }
  },
  "sap.ui5": {
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.fe.templates": {}
      }
    },
    "models": {
      "": {
        "dataSource": "mainService",
        "settings": { "synchronizationMode": "None", "operationMode": "Server", "autoExpandSelect": true }
      },
      "i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "settings": { "bundleName": "com.company.catalog.i18n.i18n" }
      }
    },
    "routing": {
      "config": {
        "routerClass": "sap.m.routing.Router",
        "viewType": "XML",
        "viewPath": "com.company.catalog.view",
        "controlId": "app",
        "controlAggregation": "pages"
      },
      "routes": [
        { "name": "list",   "pattern": "",          "target": "list"   },
        { "name": "detail", "pattern": "orders/{orderID}", "target": "detail" }
      ],
      "targets": {
        "list":   { "viewName": "List"   },
        "detail": { "viewName": "Detail" }
      }
    }
  }
}
```

---

## Custom CSS Rules

- Minimize custom CSS. Use SAP Fiori design tokens and UI5 theming instead.
- If custom CSS is needed, scope it to the app namespace.
- Never override SAP CSS classes directly — it breaks with theme updates.

```css
/* webapp/css/style.css */

/* GOOD — scoped to app namespace */
.comCompanyCatalog .myCustomHeader {
  font-weight: bold;
}

/* BAD — overriding SAP class globally */
.sapMList {
  background: red; /* NEVER */
}
```

---

## Review Checklist

- [ ] Fiori Elements used where applicable (documented if Freestyle chosen instead)
- [ ] All UI annotations in separate `*-fiori.cds` files, not in the service CDS
- [ ] Freestyle: one controller per view, extends `BaseController`
- [ ] All user-visible strings in i18n files
- [ ] OData binding used — no manual fetch/AJAX calls to the backend
- [ ] JSON models used only for local UI state — OData backend data is not copied into a JSON model
- [ ] `manifest.json` declares correct OData version (v4 for CAP)
- [ ] Custom CSS scoped to app namespace, no global SAP class overrides
- [ ] `minUI5Version` set to the agreed-upon minimum in `manifest.json`
- [ ] Growing/pagination enabled on all lists (no unbounded loads)
- [ ] Error messages displayed to user in MessageBox, not console
