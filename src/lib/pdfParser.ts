// Asynchronously inject and verify the external library from the CDN to guarantee availability
async function getPdfEngine() {
  if (typeof window === 'undefined') return null

  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js'
    script.crossOrigin = 'anonymous'
    script.integrity = 'sha512-0H7S70ZEdZ0KbyK82S7bZ6F+M8XUv97uA1Q36T+CcyM/WpSAt9F8T94z40U0L8Zf4a6E/YcW48h/S7L56eA=='
    script.referrerPolicy = 'no-referrer'

    script.onload = () => {
      const engine = (window as any).pdfjsLib
      if (engine) {
        engine.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js'
        resolve(engine)
      } else {
        reject(new Error('PDF engine layout missing from global scope window object'))
      }
    }

    script.onerror = () => {
      reject(new Error('Network timeout occurred while downloading the script engine from CDN'))
    }

    document.head.appendChild(script)
  })
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await getPdfEngine()
  if (!pdfjsLib) {
    throw new Error('Browser environment context unavailable for core file processing')
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
      if (uploadStatus) uploadStatus.textContent = 'Connecting script engine and reading text layers...'
      
      const parsedText = await extractTextFromPdf(file)
      
      if (uploadStatus) uploadStatus.textContent = 'Analysing statement interest parameters...'
      
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
      console.error('PDF Processing Error Context Log:', error)
      if (uploadStatus) uploadStatus.textContent = `Error: ${error.message || 'Failed to initialize engine components'}`
    }
  })
}
