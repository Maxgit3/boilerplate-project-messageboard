'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB Atlas!'))
  .catch(err => console.error('Connection error:', err));

const boardSchema = new Schema({
  name: { type: String, required: true, unique: true }, // Ensure unique board names
  threads: [{ type: Schema.Types.ObjectId, ref: 'Thread' }]
})

const replySchema = new Schema({
  thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
  text: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false },
  delete_password: { type: String, required: true },
  board: { type: String, required: true }
});

const threadSchema = new mongoose.Schema({
  board: String,
  text: String,
  delete_password: String,
  created_on: { type: Date, default: Date.now },
  bumped_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false },
  replies: { type: [replySchema], default: [] }
});




const Thread = mongoose.model('Thread', threadSchema);
const Reply = mongoose.model('Reply', replySchema);
const Board = mongoose.model('Board', boardSchema);

module.exports = function (app) {

  app.route('/api/threads/:board').post(function (req, res) {
    // Handle thread creation
    let board = req.body.board || req.params.board; // Use board from body or params
    if (!board) {
      return res.status(400).json({ error: 'Board name is required' });
    }
    const { text, delete_password } = req.body;
    if (!text || !delete_password) {
      return res.status(400).json({ error: 'Text and delete_password are required' });
    }
    // Check if the board exists, if not create it
    let newBoard;
    Board.findOne({ name: board })
      .then(existingBoard => {
        if (!existingBoard) {
          const createdBoard = new Board({ name: board, threads: [] });
          return createdBoard.save(); // Return the promise so the next .then() has access to the saved board
        }
        return existingBoard; // Pass the existing board along
      })
      .then(boardDoc => {
        newBoard = boardDoc;

        const newThread = new Thread({
          board,
          text,
          delete_password,
          created_on: new Date(),
          bumped_on: new Date(),
          reported: false,
          replies: []
        });


        return newThread.save();
      })
      .then(thread => {
        newBoard.threads.push(thread);
        return newBoard.save().then(() => {
          return res.json(thread);
        });
      })
      .catch(err => {
        console.error('Error handling thread creation:', err);
        return res.status(500).json({ error: 'Server error' });
      });

  }).get(function (req, res) {
    // Handle fetching threads
    const { board } = req.params;
    if (!board) {
      return res.status(400).json({ error: 'Board name is required' });
    }
    Board.findOne({ name: board }).then(foundBoard => {
      if (!foundBoard) {
        return res.status(404).json({ error: 'Board not found' });
      } else {
        Thread.find({ board: foundBoard.name })
          .sort({ bumped_on: -1 })
          .limit(10)
          .populate('replies', '-delete_password -reported')
          .then(threads => {
            // Format threads for response
            const formattedThreads = threads.map(thread => ({
              _id: thread._id,
              text: thread.text,
              created_on: thread.created_on,
              bumped_on: thread.bumped_on,
              replies: thread.replies.slice(-3).map(r => ({
                _id: r._id,
                text: r.text,
                created_on: r.created_on
              }))
            }));

            console.log('Fetched threads:', formattedThreads);
            res.json(formattedThreads);
          })
          .catch(err => res.status(500).json({ error: 'Failed to fetch threads' }));
      }

    })
  }).delete(function (req, res) {
    // Handle thread deletion
    const { thread_id, delete_password } = req.body;
    if (!thread_id || !delete_password) {
      return res.status(400).json({ error: 'Thread ID and delete_password are required' });
    }
    Thread.findById(thread_id).then(thread => {
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      if (thread.delete_password !== delete_password) {
        return res.status(200).send('incorrect password');
      }
      return Thread.findByIdAndDelete(thread_id).then(() => {
        // Remove thread from board
        return Board.findOneAndUpdate(
          { name: thread.board },
          { $pull: { threads: thread_id } },
          { new: true }
        ).then(() => res.send('success'));
      });
    }
    ).catch(err => {
      console.error('Error handling thread deletion:', err);
      return res.status(500).send('Error deleting thread');
    }
    )
  }).put(function (req, res) {
    const { thread_id } = req.body;
    if (!thread_id) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }
    Thread.findById(thread_id)
      .then(thread => {
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        if (thread.reported) {
          return res.status(200).send('Thread already reported');
        }

        thread.reported = true;
        return thread.save().then(() => {
          console.log('Thread reported:', thread_id);
          res.send('reported');
        });
      })
      .catch(err => {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
      });
  })

  app.route('/api/replies/:board').post(function (req, res) {
    const { board } = req.params;
    const { thread_id, text, delete_password } = req.body;
    if (!thread_id || !text || !delete_password) {
      return res.status(400).json({ error: 'Thread ID, text, and delete_password are required' });
    }

    Thread.findById(thread_id)
      .then(thread => {
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }

        const newReply = new Reply({
          thread: thread_id,
          text,
          delete_password,
          reported: false,
          board,
          created_on: new Date()
        });

        return newReply.save().then(savedReply => {
          thread.replies.push(savedReply); // Use the actual saved reply
          thread.bumped_on = savedReply.created_on;
          return thread.save().then(() => res.redirect(`/b/${board}/${thread_id}`));
        });
      })
      .catch(err => res.status(500).json({ error: 'Failed to create reply' }));
  }).get(function (req, res) {
    const { thread_id } = req.query;
    if (!thread_id) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    Thread.findById(thread_id)
      .then(thread => {
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }

        // Format replies to exclude sensitive fields
        const formattedReplies = thread.replies.map(reply => ({
          _id: reply._id,
          text: reply.text,
          created_on: reply.created_on
        }));

        const formattedThread = {
          _id: thread._id,
          text: thread.text,
          created_on: thread.created_on,
          bumped_on: thread.bumped_on,
          replies: formattedReplies
        };

        res.json(formattedThread);
      })
      .catch(err => {
        console.error('Error fetching thread:', err);
        res.status(500).json({ error: 'Server error' });
      });
  }).delete(function (req, res) {
    const { thread_id, reply_id, delete_password } = req.body;
    if (!thread_id || !reply_id || !delete_password) {
      return res.status(400).json({ error: 'Thread ID, reply ID, and delete_password are required' });
    }
    Thread.findById(thread_id).then(thread => {
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      const reply = thread.replies.find(r => r._id.toString() === reply_id);

      if (!reply) {
        return res.status(404).json({ error: 'Reply not found' });
      }
      console.log('Reply found:', reply);
      Reply.findById(reply_id).then(foundReply => {
        if (!foundReply) {
          return res.status(404).json({ error: 'Reply not found' });
        }
        if (foundReply.delete_password !== delete_password) {
          return res.status(200).send('incorrect password');
        }
        // Delete the Reply from its collection
        foundReply.deleteOne().then(() => {
          const embeddedReply = thread.replies.id(reply_id);
          if (!embeddedReply) {
            return res.status(404).send('Embedded reply not found');
          }

          embeddedReply.text = '[deleted]';
          return thread.save().then(() => res.send('success'));
        }).catch(err => {
          console.error('Error deleting reply:', err);
          return res.status(500).send('Error deleting reply');
        });

      })

    }).catch(err => {
      console.error('Error handling reply deletion:', err);
      return res.status(500).send('Error deleting reply');
    }
    );
  }).put(function (req, res) {
    const { thread_id, reply_id } = req.body;
    if (!thread_id || !reply_id) {
      return res.status(400).json({ error: 'Thread ID and reply ID are required' });
    }
    Thread.findById(thread_id)
      .then(thread => {
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        const reply = thread.replies.id(reply_id);
        if (!reply) {
          return res.status(404).json({ error: 'Reply not found' });
        }
        if (reply.reported) {
          return res.status(200).send('Reply already reported');
        }
        console.log('Reply found for reporting:', reply_id);
        reply.reported = true;
        thread.bumped_on = new Date(); // Update bumped_on to the current time
        thread.save();
        Reply.findByIdAndUpdate(reply_id, { reported: true });
        console.log('Reply reported:', reply_id);
        res.send('reported');
      })

  });

};
