/**
 * Application Services 層型別定義
 */
export var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["Pending"] = "pending";
    WorkflowStatus["Running"] = "running";
    WorkflowStatus["Paused"] = "paused";
    WorkflowStatus["Completed"] = "completed";
    WorkflowStatus["Failed"] = "failed";
    WorkflowStatus["Cancelled"] = "cancelled";
})(WorkflowStatus || (WorkflowStatus = {}));
//# sourceMappingURL=types.js.map