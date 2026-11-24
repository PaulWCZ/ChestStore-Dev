-- Events between tools carry an audience (SDK 0.5+): who in the publisher
-- may see the item. The Chest gives People "all" or the list of People's
-- members it allows, and People shows the item to them only. Kept beside
-- what an event wrote: null is everyone; a list, those members (and, for a
-- leave, the person it is about). Expand only: nothing is dropped.
alter table away add column audience text[];
alter table arrivals add column audience text[];
