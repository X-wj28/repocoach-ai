import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";

/** Shared by production startup and HTTP acceptance tests. */
export function configureApplication(app: INestApplication) {
  const allowedOrigins = new Set(
    [
      "http://localhost:3002",
      "https://repocoach-web.onrender.com",
      ...(process.env.WEB_ORIGIN ?? "").split(","),
    ]
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: boolean) => void,
    ) => {
      callback(null, !origin || allowedOrigins.has(origin.replace(/\/+$/, "")));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Last-Event-ID"],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
