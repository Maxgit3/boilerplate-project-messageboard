const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

let threadId = '', replyId = '';
suite('Functional Tests', function () {
    test("Creating a new thread: POST request to /api/threads/{board}", function (done) {
        chai.request(server)
            .post('/api/threads/testboard')
            .send({
                text: 'This is a test thread',
                delete_password: 'testpassword'
            })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isObject(res.body);
                assert.property(res.body, 'created_on');
                assert.property(res.body, 'bumped_on');
                assert.property(res.body, 'text');
                assert.property(res.body, 'delete_password');
                assert.property(res.body, '_id');
                threadId = res.body._id; // Store the thread ID for later tests
                done();
            })
    })
    test('Viewing the 10 most recent threads with 3 replies each: GET request to /api/threads/{board}', function (done) {
        chai.request(server)
            .get('/api/threads/testboard')
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isArray(res.body);
                assert.isAtMost(res.body.length, 10);
                res.body.forEach(thread => {
                    assert.property(thread, 'created_on');
                    assert.property(thread, 'bumped_on');
                    assert.property(thread, 'text');
                    assert.property(thread, 'replies');
                    assert.isArray(thread.replies);
                    assert.isAtMost(thread.replies.length, 3);
                });
                done();
            })
    })

    test("Deleting a thread with the incorrect password: DELETE request to /api/threads/{board}", function (done) {
        chai.request(server)
            .delete('/api/threads/testboard')
            .send({ delete_password: 'wrongpassword', thread_id: threadId })
            .end(function (err, res) {
                // console.log(res);
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'incorrect password');
                done();
            });
    })

    test("Reporting a thread: PUT request to /api/threads/{board}", function (done) {
        chai.request(server)
            .put('/api/threads/testboard')
            .send({ thread_id: threadId })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'reported');
                done();
            });
    });



    test("Creating a new reply: POST request to /api/replies/{board}", function (done) {
        chai.request(server)
            .post('/api/replies/testboard')
            .send({
                thread_id: threadId,
                text: 'This is a test reply',
                delete_password: 'replypassword'
            })
            .end(function (err, res) {
                // console.log(res);
                assert.equal(res.status, 200);
                assert.isObject(res.body);
                assert.isArray(res.redirects);
                assert.isAtLeast(res.redirects.length, 1);
                // assert.property(res.body, 'created_on');
                // assert.property(res.body, 'text');
                // assert.property(res.body, 'delete_password');
                // assert.property(res.body, '_id');
                done();
            });
    })

    test("Viewing a single thread with all its replies: GET request to /api/replies/{board}", function (done) {
        chai.request(server)
            .get("/api/replies/testboard")
            .query({ thread_id: threadId })
            .end(function (err, res) {
                console.log(res.body);
                assert.equal(res.status, 200);
                // assert.isArray(res.body);
                // res.body.forEach(reply => {
                //     assert.property(reply, 'created_on');
                //     assert.property(reply, 'text');
                //     assert.property(reply, 'delete_password');
                //     assert.property(reply, '_id');
                //     assert.property(reply, 'replies')
                // });
                replyId = res.body.replies[0]._id; // Store the reply ID for later tests
                assert.property(res.body, "replies")
                done();
            });
    })

    test("Reporting a reply: PUT request to /api/replies/{board}", function (done) {
        chai.request(server).put('/api/replies/testboard')
            .send({
                thread_id: threadId,
                reply_id: replyId // Replace with a valid reply ID if needed
            })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'reported');
                done();
            });
    })

    test("Deleting a reply with the incorrect password: DELETE request to /api/replies/{board}", function (done) {
        chai.request(server).delete('/api/replies/testboard')
            .send({
                delete_password: 'wrongpassword',
                thread_id: threadId,
                reply_id: replyId
            })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'incorrect password');
                done();
            });
    })

    test("Deleting a reply with the correct password: DELETE request to /api/replies/{board}", function (done) {
        chai.request(server).delete('/api/replies/testboard')
            .send({
                delete_password: 'replypassword',
                thread_id: threadId,
                reply_id: replyId
            })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'success');
                done();
            });
    })
    test("Deleting a thread with the correct password: DELETE request to /api/threads/{board}", function (done) {
        chai.request(server).delete('/api/threads/testboard')
            .send({
                delete_password: 'testpassword',
                thread_id: threadId
            })
            .end(function (err, res) {
                assert.equal(res.status, 200);
                assert.isString(res.text);
                assert.equal(res.text, 'success');
                done();
            });
    })


});
