export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  
  const pdfjsLib = (window as any).pdfjsLib
  if (!pdfjsLib) {
    throw new Error('PDF engine not found in global window scope')
  }

  // Convert raw arrayBuffer to a structured Uint8Array to satisfy the document wrapper parser
  const typedArray = new Uint8Array(arrayBuffer)
  const loadingTask = pdfjsLib.getDocument({ data: typedArray })
  const pdf = await loadingTask.promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      
    fullText += pageText + '\n'
  }

  return fullText
}

export function parseCreditCardMetrics(text: string): { interestRate: string; minimumPayment: string } {
  const interestRateRegexes = [
    /(?:purchase|interest|annual)?\s*rate\s*(?:of)?\s*(\d+(?:\.\d+)?\s*%)/i,
    /(?:apr)\s*(?:is)?\s*(\d+(?:\.\d+)?\s*%)/i,
    /(\d+(?:\.\d+)?\s*%)\s*(?:variable)?\s*(?:per\s*annum|p\.a\.)/i
  ]

  const minimumPaymentRegexes = [
    /(?:minimum|min)\s*(?:monthly)?\s*(?:payment|amount)\s*(?:due)?\s*(?:of)?\s*(?:£)?\s*(\d+(?:\.\d{2})?)/i,
    /(?:payment\s*due)\s*(?:£)?\s*(\d+(?:\.\d{2})?)/i
  ]

  let interestRate = 'Not detected'
  let minimumPayment = 'Not detected'

  for (const regex of interestRateRegexes) {
    const match = text.match(regex)
    if (match && match[1]) {
      interestRate = match[1].trim()
      break
    }
  }

  for (const regex of minimumPaymentRegexes) {
    const match = text.match(regex)
    if (match && match[1]) {
      minimumPayment = `£${parseFloat(match[1]).toFixed(2)}`
      break
    }
  }

  return { interestRate, minimumPayment }
}

if (typeof window !== 'undefined') {
  window.addEventListener('statement-selected', async (event: any) => {
    const file = event.detail?.file
    if (!file) return

    const previewContainer = document.getElementById('preview-container')
    const extractedRate = document.getElementById('extracted-rate')
    const extractedMinimum = document.getElementById('extracted-minimum')
    const uploadStatus = document.getElementById('upload-status')

    try {
      if (uploadStatus) uploadStatus.textContent = 'Extracting statement text locally...'
      
      const parsedText = await extractTextFromPdf(file)
      
      if (uploadStatus) uploadStatus.textContent = 'Analysing financial metrics...'
      
      const { interestRate, minimumPayment } = parseCreditCardMetrics(parsedText)
      
      if (extractedRate) extractedRate.textContent = interestRate
      if (extractedMinimum) extractedMinimum.textContent = minimumPayment
      if (previewContainer) previewContainer.classList.remove('hidden')
      
      const textReadyEvent = new CustomEvent('statement-text-ready', {
        detail: { text: parsedText, interestRate, minimumPayment }
      })
      window.dispatchEvent(textReadyEvent)
      
      if (uploadStatus) uploadStatus.textContent = 'Analysis complete'
    } catch (error: any) {
      if (uploadStatus) {
        uploadStatus.textContent = `Parsing error: ${error.message || 'Wrapper failure'}`
      }
      console.error(error)
    }
  })
}
