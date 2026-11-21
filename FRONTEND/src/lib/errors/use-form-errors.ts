import { useCallback, useState } from 'react'
import { applyFieldErrors, handleError } from './error-handler.ts'
import type { AppError } from './types.ts'

export interface FormErrors {
  /** Error to show above the buttons (null when every problem sits on a field). */
  formError: AppError | null
  /** Server message for one field, if any. */
  field: (name: string) => string | undefined
  /** Same, as the list the form field components take. */
  fieldList: (name: string) => string[]
  /** Records a failed submit: field errors go to their fields, the rest to formError. */
  capture: (error: unknown) => AppError
  clear: () => void
}

/**
 * Submit errors of one form. Validation messages land on the listed fields; everything else (and
 * validation messages for fields the form does not have) becomes the form error. Nothing is toasted:
 * the person is looking at the form.
 */
export function useFormErrors(fields: readonly string[], context?: string): FormErrors {
  const [state, setState] = useState<{ form: AppError | null; fields: Record<string, string> }>({
    form: null,
    fields: {},
  })

  const capture = useCallback(
    (error: unknown) => {
      const appError = handleError(error, { silent: true, context })
      const onFields: Record<string, string> = {}
      const leftover = applyFieldErrors(appError, (name, message) => (onFields[name] = message), fields)
      const placed = Object.keys(onFields).length > 0
      setState({ form: placed && Object.keys(leftover).length === 0 ? null : appError, fields: onFields })
      return appError
    },
    [fields, context],
  )

  const clear = useCallback(() => setState({ form: null, fields: {} }), [])
  const field = useCallback((name: string) => state.fields[name], [state.fields])
  const fieldList = useCallback(
    (name: string) => (state.fields[name] ? [state.fields[name]] : []),
    [state.fields],
  )

  return { formError: state.form, field, fieldList, capture, clear }
}
