import { createContext, useContext } from 'react'

/** Provided by the rep layout: re-runs the device health check and reports it. */
export const RecheckContext = createContext<() => Promise<void>>(async () => {})

export const useRecheckHealth = () => useContext(RecheckContext)
