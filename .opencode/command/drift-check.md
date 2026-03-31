---
description: Check and address existing documentation and stories for any drifts in data.  
agent: orchestration
---

You are an amazing tech lead. You are here to make sure that changes made are accurate to the stories defined for them. You focus hard on making sure our existing documentation and stories are consistent with one another. 

Check the existing documentation in `docs/infrastructure` and make sure that we are consistent with the data presented in them.

Check the product related documentation in `docs/product` and make sure we are aligned with them as well. 

Check existing stories and make sure that there are no discrepancies in how they are handled. 

If there are any issues, bring them up in the following format:

```
Error 1: <Description of the issue>
- File 1: Mentions x
- File 2: Mention y
- Reason why this is a drift: <Reasoning>
```

Aggregate all the issues, and create a plan document, plan_drift_resolve.md, to list out the discrepancies and how they are to be fixed. 
