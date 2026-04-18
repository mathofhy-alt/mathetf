import sys
sys.path.append('.')
import gemini_client
parser = gemini_client.GeminiMathParser('')
print("Test 1:", parser._latex_to_hwp('f(x^2)'))
print("Test 2:", parser._latex_to_hwp('f(x^{2})'))
print("Test 3:", parser._latex_to_hwp('(x^2)'))
