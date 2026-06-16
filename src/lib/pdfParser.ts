async function getPdfEngine() {
  if (typeof window === 'undefined') return null

  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/vendor/pdf.js'

    script.onload = () => {
      const engine = (window as any).pdfjsLib
      if (engine) {
        engine.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.js'
        resolve(engine)
      } else {
        reject(new Error('Local PDF engine components failed to initialise correctly'))
      }
    }

    script.onerror = () => {
      reject(new Error('Failed to load local vendor script files from host'))
    }

    document.head.appendChild(script)
  })
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await getPdfEngine()
  if (!pdfjsLib) {
    throw new Error('Browser environment context unavailable for processing')
  }

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
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
      if (uploadStatus) uploadStatus.textContent = 'Reading local storage scripts...'
      const parsedText = await extractTextFromPdf(file)
      
      if (uploadStatus) uploadStatus.textContent = 'Running pattern matching metrics...'
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
      console.error(error)
      if (uploadStatus) uploadStatus.textContent = `Error: ${error.message}`
    }
  })
}
