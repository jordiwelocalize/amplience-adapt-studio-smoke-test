# Amplience Adapt Studio connection test

Dashboard extension used to prove that Epson can register a Welocalize extension on an Amplience hub. It connects with `dc-extensions-sdk` and shows the hub name. It does not read content or create a translation job.

## Register on the dev hub

In Amplience: Development → Extensions → Register extension.

| Field | Value |
| --- | --- |
| Category | Dashboard |
| Label | Welocalize Adapt Studio test |
| Name | welocalize-adapt-studio-test |
| URL | https://jordiwelocalize.github.io/amplience-adapt-studio-smoke-test/index.html |
| Description | Connection test for the Adapt Studio dashboard extension. |

Leave Permissions off. Installation parameters can stay empty.

Save, then open Dashboard and select the tab **Welocalize Adapt Studio test**. A successful test shows **Connected** and the hub name.

Register this on the dev hub, not on Epson EMEAR Prod.
