/**
 * Greedy matcher cron worker.
 *
 * CONTRACT SAFETY: This worker MUST NOT send any messages to the notification
 * queue. The notification queue only accepts interview lifecycle events
 * (interview.created, interview.cancelled, interview.match.created) and
 * reminder.due messages. Cron tick payloads are not valid queue messages.
 *
 * Matcher execution should be invoked directly or via a dedicated matcher queue,
 * never by sending unrelated cron-tick payloads into the notification queue.
 */
export default {
  async scheduled(controller: ScheduledController) {
    console.log("greedy-matcher.cron.tick", {
      timestamp: new Date().toISOString(),
      scheduled_time: controller.scheduledTime,
    })
  },
}
