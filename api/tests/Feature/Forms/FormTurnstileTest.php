<?php

declare(strict_types=1);

use App\Rules\ValidTurnstile;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config(['services.turnstile.site_key' => 'test-site-key', 'services.turnstile.secret_key' => 'test-secret']);
    Http::preventStrayRequests();
    $user = $this->actingAsProUser();
    $this->turnstileUser = $user;
    $this->turnstileForm = $this->createForm($user, $this->createUserWorkspace($user), [
        'use_captcha' => true,
        'captcha_provider' => 'turnstile',
        'properties' => [],
    ]);
});

it('rejects missing or malformed Turnstile tokens without contacting Cloudflare', function ($token) {
    Http::fake();
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), ['cf-turnstile-response' => $token])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    Http::assertNothingSent();
    expect($this->turnstileForm->submissions()->count())->toBe(0);
})->with([[null], [''], [['not-a-string']], [123], [str_repeat('x', 2049)]]);

it('rejects unsuccessful verification responses', function (array $response, int $status) {
    Http::fake([ValidTurnstile::VERIFY_URL => Http::response($response, $status)]);
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), ['cf-turnstile-response' => 'test-token'])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    expect($this->turnstileForm->submissions()->count())->toBe(0);
})->with([
    'invalid' => [['success' => false, 'error-codes' => ['invalid-input-response']], 200],
    'expired or replayed' => [['success' => false, 'error-codes' => ['timeout-or-duplicate']], 200],
    'malformed' => [[], 200],
    'truthy success' => [['success' => 'true', 'action' => 'form_submit'], 200],
    'wrong action' => [['success' => true, 'action' => 'login'], 200],
    'missing action' => [['success' => true], 200],
    'server failure' => [['success' => true, 'action' => 'form_submit'], 503],
]);

it('rejects verification timeouts', function () {
    Http::fake(fn () => throw new ConnectionException('Timed out'));
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), ['cf-turnstile-response' => 'test-token'])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    expect($this->turnstileForm->submissions()->count())->toBe(0);
});

it('fails closed when the secret is missing', function () {
    config(['services.turnstile.secret_key' => null]);
    Http::fake();
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), ['cf-turnstile-response' => 'test-token'])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    Http::assertNothingSent();
});

it('saves a verified submission and rejects reuse of its token', function () {
    Http::fake([ValidTurnstile::VERIFY_URL => Http::sequence()
        ->push(['success' => true, 'action' => 'form_submit'])
        ->push(['success' => false, 'error-codes' => ['timeout-or-duplicate']]),
    ]);
    $url = route('forms.answer', $this->turnstileForm->slug);
    $this->postJson($url, ['cf-turnstile-response' => 'test-token'])->assertSuccessful();
    $this->postJson($url, ['cf-turnstile-response' => 'test-token'])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    expect($this->turnstileForm->submissions()->count())->toBe(1);
    Http::assertSent(fn ($request) => $request->url() === ValidTurnstile::VERIFY_URL
        && $request['secret'] === 'test-secret' && $request['response'] === 'test-token');
});

it('does not consume a token or save an answer during precognition', function () {
    Http::fake();
    $this->withPrecognition()->postJson(route('forms.answer', $this->turnstileForm->slug), [
        'cf-turnstile-response' => 'test-token',
    ])->assertSuccessfulPrecognition();
    Http::assertNothingSent();
    expect($this->turnstileForm->submissions()->count())->toBe(0);
});

it('does not allow a partial flag to bypass verification when partial saves are disabled', function () {
    Http::fake();
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), ['is_partial' => true])
        ->assertUnprocessable()->assertJsonValidationErrors('cf-turnstile-response');
    Http::assertNothingSent();
    expect($this->turnstileForm->submissions()->count())->toBe(0);
});

it('publishes only the site key in feature flags', function () {
    $response = $this->getJson(route('content.feature-flags'))->assertSuccessful()
        ->assertJsonPath('services.turnstile.site_key', 'test-site-key');
    expect($response->getContent())->not->toContain('test-secret');
});

it('hides Turnstile when its secret is not configured', function () {
    config(['services.turnstile.secret_key' => null]);
    $this->getJson(route('content.feature-flags'))->assertSuccessful()
        ->assertJsonPath('services.turnstile.site_key', null);
});

it('allows an owner to save Turnstile as the form provider', function () {
    $user = $this->turnstileUser;
    $form = $this->createForm($user, $this->createUserWorkspace($user));
    $data = (new \App\Http\Resources\FormResource($form))->toArray(request());
    $data['use_captcha'] = true;
    $data['captcha_provider'] = 'turnstile';
    $this->putJson(route('open.forms.update', $form->id), $data)->assertSuccessful();
    expect($form->refresh()->captcha_provider)->toBe('turnstile');
    expect($form->use_captcha)->toBeTruthy();
});

it('does not verify Turnstile when bot protection is disabled', function () {
    $this->turnstileForm->update(['use_captcha' => false]);
    Http::fake();
    $this->postJson(route('forms.answer', $this->turnstileForm->slug), [])->assertSuccessful();
    Http::assertNothingSent();
    expect($this->turnstileForm->submissions()->count())->toBe(1);
});
