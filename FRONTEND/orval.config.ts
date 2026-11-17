import { defineConfig } from 'orval'

// Builds typed fetch functions + TanStack Query hooks (GET -> useQuery,
// other verbs -> useMutation) from the backend OpenAPI document.
// The backend writes BACKEND/openapi/openapi.json on every build.
// Run: npm run api:generate
export default defineConfig({
  pharma: {
    input: {
      target: '../BACKEND/openapi/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/endpoints',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      formatter: 'prettier',
      override: {
        header: (info) => [
          `${info.title} ${info.version}.`,
          'Do not edit by hand; re-run `npm run api:generate` after backend API changes.',
        ],
        mutator: {
          path: 'src/lib/api-client.ts',
          name: 'apiFetch',
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
        query: {
          signal: true,
        },
      },
    },
  },
})
