import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ApiError, toApi } from "./mvp";
import { createStoreFromEnv, type AppStore } from "./persistence";

export function createApp(store: AppStore = createStoreFromEnv(process.env)): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(async (request, response, next) => {
    try {
      await store.ready;
      if (request.method !== "GET" && store.persist) {
        response.on("finish", () => {
          if (response.statusCode < 400) {
            void store.persist?.();
          }
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  const actor = (request: Request) => store.actor(request.header("x-actor-id"));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/managed-systems", (request, response, next) => {
    try {
      response.json(toApi(store.listManagedSystems(actor(request))));
    } catch (error) {
      next(error);
    }
  });

  app.get("/analytics-areas", (request, response, next) => {
    try {
      response.json(toApi(store.listAnalyticsAreas(actor(request), request.query.managed_system_id?.toString())));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createVoc(actor(request), request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/vocs", (request, response, next) => {
    try {
      response.json(toApi(store.listVocs(actor(request), request.query.managed_system_id?.toString())));
    } catch (error) {
      next(error);
    }
  });

  app.get("/vocs/:id", (request, response, next) => {
    try {
      response.json(toApi(store.getVoc(actor(request), request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/vocs/:id", (request, response, next) => {
    try {
      response.json(toApi(store.patchVoc(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs/:id/request-task", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.requestTaskFromVoc(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs/:id/create-finding", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createFindingFromVoc(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs/:id/public-updates", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createConversation(actor(request), request.params.id, "public_update", request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs/:id/reporter-replies", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createConversation(actor(request), request.params.id, "reporter_reply", request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/vocs/:id/internal-comments", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createConversation(actor(request), request.params.id, "internal_comment", request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/vocs/:id/reporter-summary", (request, response, next) => {
    try {
      response.json(store.reporterSummary(actor(request), request.params.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/voc-clusters", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createCluster(actor(request), request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/voc-clusters/:id/create-finding", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createFindingFromCluster(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/findings/:id/request-task", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.requestTaskFromFinding(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/findings", (request, response, next) => {
    try {
      response.json(toApi(store.listFindings(actor(request), request.query.managed_system_id?.toString())));
    } catch (error) {
      next(error);
    }
  });

  app.get("/findings/:id", (request, response, next) => {
    try {
      response.json(toApi(store.getFinding(actor(request), request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/findings", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createFinding(actor(request), request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/task-requests", (request, response, next) => {
    try {
      response.json(toApi(store.listTaskRequests(actor(request), request.query.managed_system_id?.toString())));
    } catch (error) {
      next(error);
    }
  });

  app.post("/task-requests/:id/approve", (request, response, next) => {
    try {
      response.json(toApi(store.approveTaskRequest(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/task-requests/:id/reject", (request, response, next) => {
    try {
      response.json(toApi(store.rejectTaskRequest(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/task-requests/:id/request-more-evidence", (request, response, next) => {
    try {
      response.json(toApi(store.requestMoreEvidenceForTaskRequest(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/task-requests/:id/convert-to-task", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.convertTaskRequest(actor(request), request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/tasks/:id", (request, response, next) => {
    try {
      response.json(toApi(store.patchTask(actor(request), request.params.id, request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/tasks", (request, response, next) => {
    try {
      response.json(toApi(store.listTasks(actor(request), request.query.managed_system_id?.toString())));
    } catch (error) {
      next(error);
    }
  });

  app.post("/permission-requests", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createPermissionRequest(actor(request), request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/permission-requests", (request, response, next) => {
    try {
      response.json(toApi(store.listPermissionRequests(actor(request))));
    } catch (error) {
      next(error);
    }
  });

  app.post("/permission-requests/:id/approve", (request, response, next) => {
    try {
      response.json(toApi(store.approvePermissionRequest(actor(request), request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/entity-links", (request, response, next) => {
    try {
      response.json(toApi(store.listEntityLinks(actor(request))));
    } catch (error) {
      next(error);
    }
  });

  app.post("/entity-links", (request, response, next) => {
    try {
      response.status(201).json(toApi(store.createEntityLink(actor(request), request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/dashboard/action-queues", (request, response, next) => {
    try {
      response.json(store.dashboardQueues(actor(request)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/survey-responses/:id/create-voc", (_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "Survey Response to VOC conversion is not available." } });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    response.status(500).json({ error: { code: "internal_error", message: error instanceof Error ? error.message : "Unknown error" } });
  });

  return app;
}
