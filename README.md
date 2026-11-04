# Welocalize Amplience extension

Dashboard extension for Epson. An author selects content, target locales, a due date, and a review choice, then follows the request from the same tab.

This version covers:

- Select content and submit it (PLTFRM-7782)
- See request status in Amplience (PLTFRM-7783)
- Choose whether to request human review (PLTFRM-7785)

Writing a localized content item back to Amplience, and review in the Opal Editor, are not in this version.

The extension sends each content item as the JSON Amplience stores, together with the content item id. It does not build XLIFF.

## Register on the dev hub

In Amplience: Development → Extensions → Register extension.

| Field | Value |
| --- | --- |
| Category | Dashboard |
| Label | Welocalize translation |
| Name | welocalize-translation |
| URL | https://jordiwelocalize.github.io/amplience-adapt-studio-smoke-test/index.html |
| Permissions | Read |

Register this on the dev hub, not on Epson EMEAR Prod. The published URL serves `main`. This branch is `pltfrm-7782-amplience-extension`. Point the hub at it after the branch is published.

Read permission is required to list and open content items. Modify is not required yet, because this version does not write translations back. The extension sets the source item to In progress only after Pantheon accepts the request, and that call also needs Modify.

## Installation parameters

```json
{
  "sourceLocale": "en",
  "targetLocales": ["de-DE", "fr-FR"],
  "contentTypeUris": ["https://example.com/banner.json"],
  "submissionUrl": "https://pantheon.example/amplience/submissions",
  "statuses": {
    "ready": "",
    "inProgress": ""
  }
}
```

Leave a field out to use the default. Target locales default to the Epson English-to-all list. When `statuses` are empty, the extension matches workflow labels that contain "Ready" and "In progress".

`submissionUrl` is the Welocalize handoff in `server/`. The extension does not store a Pantheon credential. When the URL is empty, the request is kept in this browser and Welocalize has not received it.

The handoff calls the public Client API: create the project, upload each content item as a work JSON file, then start the project. Copy `.env.example` to `.env` and set `CLIENT_API_TOKEN`. The token is the Client API key for the platform instance that should own the project. When `CLIENT_API_SERVICE_ID` is empty and that token can see one service, that service is used.

```bash
node server/index.js
```

The process listens on port 8787. Ash's browser has to reach that process over HTTPS. The Client API base URL defaults to `https://hypnos-client-api.welocalize.io`. On that environment the sandbox token can see service `blackbirdio_test`. A submitted request shows up in `GET /v1/client-api/projects` for the same token. The project reference id is the extension's `clientRequestId`.

### Handoff contract

`POST {submissionUrl}`

```json
{
  "clientRequestId": "uuid",
  "hubId": "hub id",
  "hubName": "epson-emear-dev",
  "sourceLocale": "en",
  "targetLocales": ["de-DE"],
  "dueDate": "2026-11-20",
  "review": "none",
  "items": [
    {
      "contentItemId": "content item id",
      "label": "Hero",
      "schema": "https://example.com/hero.json",
      "locale": "en",
      "deliveryKey": "hero",
      "version": 3,
      "body": {}
    }
  ]
}
```

On screen, human review is a single checkbox, "Request human review". The requester does not see Pantheon, XTM, or the Opal Editor. The stored `review` value is still `none` or `xtm` (`xtm` means human review was requested). The response is JSON:

```json
{ "projectId": "12345", "status": "submitted" }
```

`GET {submissionUrl}?hubId={hubId}` returns:

```json
{
  "requests": [
    { "clientRequestId": "uuid", "projectId": "12345", "status": "in_review", "error": null }
  ]
}
```

Status values the tab understands: `submitted`, `in-translation`, `in-review`, `complete`, `failed`. `in_progress` is shown as In translation. `delivered` is shown as Complete.

The endpoint must allow the extension origin. GitHub Pages serves this app from `https://jordiwelocalize.github.io`.

## Run the checks

```bash
node --test test/submission.test.js
```

Opening the page outside Amplience shows that it is not connected. Add `#preview` to the URL to walk the screens with one sample content item. Content search on a hub runs only inside a dashboard tab where Read is granted.
