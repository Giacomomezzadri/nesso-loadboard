import { termsPage } from './_lib/terms'

/** Public: reachable before login so the text can be read before it is accepted. */
export const onRequestGet: PagesFunction = async () => termsPage()
