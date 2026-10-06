The JSON feed and processing-report schemas are unmodified snapshots retrieved on 2026-10-05 from Amazon's official `amzn/selling-partner-api-models` repository, Apache-2.0:

- https://github.com/amzn/selling-partner-api-models/blob/main/schemas/feeds/listings-feed-schema-v2.json
- https://github.com/amzn/selling-partner-api-models/blob/main/schemas/feeds/listings-feed-processing-report-schema-v2.json

Refresh and re-run contract tests before promoting a change in feed version. Product attribute validation still uses the account's current Product Type Definitions schema.

Notification snapshots retrieved from the same Apache-2.0 repository on 2026-10-05:

- https://github.com/amzn/selling-partner-api-models/blob/main/schemas/notifications/ListingsItemStatusChangeNotification.json
- https://github.com/amzn/selling-partner-api-models/blob/main/schemas/notifications/ListingsItemIssuesChangeNotification_2023-12-13.json

The status snapshot's enum contains `LISTINGS_ITEM_STATUS_CHANGED`, conflicting with its own example and the documented API name `LISTINGS_ITEM_STATUS_CHANGE`. The runtime validator applies only that enum correction to a clone; this source file remains unmodified. Only notification version 1.0 and the documented payload versions are accepted. MarketplaceId, although optional in Amazon's schema, is mandatory for this consumer's safe account routing. Missing identifiers remain in SQS for investigation/DLQ.
