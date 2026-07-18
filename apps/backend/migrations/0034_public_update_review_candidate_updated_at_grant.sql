-- Candidate resolution is an observable state change. The runtime role needs
-- this column in addition to the 0033 resolution fields to stamp that change.
GRANT UPDATE (updated_at) ON voc.public_update_review_candidates TO fops_app;
