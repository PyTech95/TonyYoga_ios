import assert from 'node:assert/strict';
import fs from 'node:fs';
const url = new URL('../frontend/src/lib/commercePolicy.js', import.meta.url);
// Import a pure module from its real contents without altering the CRA project's module mode.
const policy = await import('data:text/javascript;base64,' + fs.readFileSync(url).toString('base64'));
let checks = 0;
for (const [path, blocked] of [
 ['/paypal/create-order',true], ['/paypal/capture/123',true], ['/checkout/session',true],
 ['/checkout/credit-release',true], ['/gift-cards/redeem',true],
 ['https://tonyoga.com/api/paypal/create-order',true],
 ['/ios-commerce/prepare',false], ['/ios-commerce/external-checkout',false],
 ['/ios-commerce/verify',false], ['/orders/create',false], ['/paypal/config',false]
]) { assert.equal(policy.isLegacyPaymentRequest(path),blocked,path); checks++; }
for (const [url, allowed] of [
 ['https://www.amazon.com/Printed-Yoga/dp/0123456789',true],
 ['https://amazon.in/gp/product/B000000001',true],
 ['https://amazon.com/book-ebook/dp/B000000001',false],
 ['https://amazon.com/dp/B000000001?type=Kindle',false],
 ['https://amazon.com.evil.test/dp/B000000001',false],
 ['https://amazon.com@evil.test/dp/B000000001',false],
 ['javascript:alert(1)',false],['https://amzn.to/12345',false],
 ['http://www.amazon.com/dp/0123456789',false]
]) { assert.equal(policy.isAmazonPrintURL(url),allowed,url); checks++; }
assert.equal(policy.paymentError({response:{data:{detail:'Declined'}}}),'Declined'); checks++;
assert.equal(policy.paymentError({message:'Network error'}),'Network error'); checks++;
assert.equal(policy.paymentError({response:{data:{detail:[{}]}}}),'Unable to complete the purchase. Please try again.'); checks++;
console.log(`${checks} JavaScript policy assertions passed.`);
